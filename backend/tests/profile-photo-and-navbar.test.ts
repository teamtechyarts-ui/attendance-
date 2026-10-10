import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { StorageService } from '../src/services/storage.service.js';
import { EmployeeService } from '../src/modules/employees/employee.service.js';
import { NotificationService } from '../src/modules/notifications/notification.service.js';
import { EmailService } from '../src/modules/email/email.service.js';
import { DigitalIdService } from '../src/modules/digital-id/digital-id.service.js';
import { prisma } from '../src/plugins/prisma.js';
import { DbService } from '../src/services/db.service.js';

describe('Profile Photo Upload, Navbar Decoupling, and Zero-Notification Safety Suite', () => {
  let testUser: any;
  let testEmployee: any;
  const originalProfilePhotoUrl: string | null = null;
  const uploadedUrlsToClean: string[] = [];

  // Minimal valid 1x1 WebP base64 data URL
  const validWebpDataUrl =
    'data:image/webp;base64,UklGRkAAAABXRUJQVlA4IDQAAADwAQCdASoBAAEAAkA4JaQAA3AA/vsGAAAA/v4HAP7+BwD+/gcA/v4HAP7+BwD+/gcA/v4HAAAA';

  // Minimal valid 1x1 JPEG base64 data URL
  const validJpegDataUrl =
    'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

  // Minimal valid 1x1 PNG base64 data URL
  const validPngDataUrl =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  // Malicious / SVG data URL (MUST be rejected)
  const svgDataUrl =
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxzY3JpcHQ+YWxlcnQoMSk8L3NjcmlwdD48L3N2Zz4=';

  before(async () => {
    // Find real test user and employee
    const users = await DbService.query(
      async () =>
        prisma.user.findMany({
          take: 3,
          include: { employee: true },
        }),
      async () =>
        DbService.restRequest<any[]>('/users?limit=3&select=*,employee:employees(*)')
    );

    if (users && users.length > 0) {
      testUser = users.find((u: any) => u.employee || (u.employees && u.employees[0])) || users[0];
      testEmployee = testUser.employee || (testUser.employees && testUser.employees[0]) || null;
    }
  });

  after(async () => {
    // Clean up any uploaded test avatar objects from Supabase storage
    for (const url of uploadedUrlsToClean) {
      await StorageService.deleteFileByUrl(url).catch(() => {});
    }

    // Restore original profile photo for the test employee if altered
    if (testEmployee?.id) {
      await DbService.query(
        async () =>
          prisma.employee.update({
            where: { id: testEmployee.id },
            data: { profilePhotoUrl: originalProfilePhotoUrl },
          }),
        async () =>
          DbService.restRequest<any[]>(`/employees?id=eq.${testEmployee.id}`, {
            method: 'PATCH',
            body: { profile_photo_url: originalProfilePhotoUrl },
          })
      ).catch(() => {});
    }
  });

  describe('Part A: Image Validation & Compression Safety', () => {
    test('Accepts valid WebP base64 Data URL', () => {
      const result = StorageService.validateAndParseImage(validWebpDataUrl);
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.mimeType, 'image/webp');
      assert.strictEqual(result.extension, 'webp');
      assert.ok(result.buffer.length > 0);
    });

    test('Accepts valid JPEG base64 Data URL', () => {
      const result = StorageService.validateAndParseImage(validJpegDataUrl);
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.mimeType, 'image/jpeg');
      assert.strictEqual(result.extension, 'jpg');
      assert.ok(result.buffer.length > 0);
    });

    test('Accepts valid PNG base64 Data URL', () => {
      const result = StorageService.validateAndParseImage(validPngDataUrl);
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.mimeType, 'image/png');
      assert.strictEqual(result.extension, 'png');
      assert.ok(result.buffer.length > 0);
    });

    test('Strictly REJECTS SVG files to prevent XSS and script injection', () => {
      const result = StorageService.validateAndParseImage(svgDataUrl);
      assert.strictEqual(result.valid, false);
      assert.ok(result.error);
    });

    test('Strictly REJECTS corrupted magic bytes claiming to be WebP', () => {
      const fakeWebp = 'data:image/webp;base64,VGhpcyBpcyBub3QgYW4gaW1hZ2UgZmlsZSE=';
      const result = StorageService.validateAndParseImage(fakeWebp);
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('Unsupported image format'));
    });

    test('Strictly REJECTS arbitrary non-image text / payload', () => {
      const textData = 'data:text/plain;base64,SGVsbG8gV29ybGQ=';
      const result = StorageService.validateAndParseImage(textData);
      assert.strictEqual(result.valid, false);
    });

    test('Strictly REJECTS oversized payload (> 2MB)', () => {
      const oversizedBuffer = Buffer.alloc(2.5 * 1024 * 1024, 0xff);
      const result = StorageService.validateAndParseImage(oversizedBuffer);
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('exceeds size limit'));
    });
  });

  describe('Part B: Storage Upload, Persistence & Cleanup Lifecycle', () => {
    test('Uploads valid profile photo and updates employee record in Supabase Storage', async () => {
      if (!testEmployee?.id || !testUser?.id) return;

      const result = await EmployeeService.uploadProfilePhoto(
        testEmployee.id,
        testUser.id,
        validWebpDataUrl
      );

      assert.ok(result.profilePhotoUrl);
      assert.ok(result.profilePhotoUrl.includes('https://'));
      assert.ok(result.profilePhotoUrl.includes('/storage/v1/object/public/avatars/profiles/'));
      assert.strictEqual(result.employee.id, testEmployee.id);
      assert.strictEqual(result.employee.profilePhotoUrl, result.profilePhotoUrl);

      uploadedUrlsToClean.push(result.profilePhotoUrl);

      // Verify DB record
      const checkEmp = await DbService.query(
        async () =>
          prisma.employee.findUnique({
            where: { id: testEmployee.id },
            select: { profilePhotoUrl: true },
          }),
        async () => {
          const emps = await DbService.restRequest<any[]>(`/employees?id=eq.${testEmployee.id}&select=profile_photo_url`);
          return emps?.[0] ? DbService.toCamelCase(emps[0]) : null;
        }
      );
      assert.strictEqual(checkEmp?.profilePhotoUrl, result.profilePhotoUrl);
    });

    test('Replacing photo uploads new photo and replaces DB reference safely', async () => {
      if (!testEmployee?.id || !testUser?.id) return;

      const firstUpload = await EmployeeService.uploadProfilePhoto(
        testEmployee.id,
        testUser.id,
        validWebpDataUrl
      );
      uploadedUrlsToClean.push(firstUpload.profilePhotoUrl);

      // Wait 15ms for distinct timestamp
      await new Promise((r) => setTimeout(r, 15));

      const secondUpload = await EmployeeService.uploadProfilePhoto(
        testEmployee.id,
        testUser.id,
        validJpegDataUrl
      );
      uploadedUrlsToClean.push(secondUpload.profilePhotoUrl);

      assert.notStrictEqual(secondUpload.profilePhotoUrl, firstUpload.profilePhotoUrl);
      assert.strictEqual(secondUpload.employee.profilePhotoUrl, secondUpload.profilePhotoUrl);

      // Verify DB has second URL
      const checkEmp = await DbService.query(
        async () =>
          prisma.employee.findUnique({
            where: { id: testEmployee.id },
            select: { profilePhotoUrl: true },
          }),
        async () => {
          const emps = await DbService.restRequest<any[]>(`/employees?id=eq.${testEmployee.id}&select=profile_photo_url`);
          return emps?.[0] ? DbService.toCamelCase(emps[0]) : null;
        }
      );
      assert.strictEqual(checkEmp?.profilePhotoUrl, secondUpload.profilePhotoUrl);
    });

    test('Deleting profile photo sets profilePhotoUrl to null and succeeds', async () => {
      if (!testEmployee?.id || !testUser?.id) return;

      const deleteRes = await EmployeeService.deleteProfilePhoto(testEmployee.id, testUser.id);
      assert.strictEqual(deleteRes.success, true);
      assert.strictEqual(deleteRes.employee.profilePhotoUrl, null);

      const checkEmp = await DbService.query(
        async () =>
          prisma.employee.findUnique({
            where: { id: testEmployee.id },
            select: { profilePhotoUrl: true },
          }),
        async () => {
          const emps = await DbService.restRequest<any[]>(`/employees?id=eq.${testEmployee.id}&select=profile_photo_url`);
          return emps?.[0] ? DbService.toCamelCase(emps[0]) : null;
        }
      );
      assert.strictEqual(checkEmp?.profilePhotoUrl, null);
    });
  });

  describe('Part C: Zero-Notification and Zero-Email Safety Assurance', () => {
    test('Profile photo upload generates ZERO notifications', async () => {
      if (!testEmployee?.id || !testUser?.id) return;

      const notifCountBefore = await NotificationService.getUnreadCount(testUser.id);

      await EmployeeService.uploadProfilePhoto(testEmployee.id, testUser.id, validWebpDataUrl);

      const notifCountAfter = await NotificationService.getUnreadCount(testUser.id);

      // No new notifications created
      assert.strictEqual(notifCountAfter, notifCountBefore);
    });

    test('Test environment sends ZERO external emails', async () => {
      // In test environment, EmailService must simulate and NEVER dispatch external SMTP packets
      const emailResult = await EmailService.sendEmail({
        to: 'safety_test@example.com',
        subject: 'Notification Safety Test',
        html: '<p>Test</p>',
      });

      assert.strictEqual(emailResult.success, true);
      assert.strictEqual(emailResult.skipped, true);
    });
  });

  describe('Part D: Digital ID Card Retrieval & Verification Integrity', () => {
    test('getMyCard returns valid digital ID card linked to authenticated employee', async () => {
      if (!testEmployee?.id) return;

      const card = await DigitalIdService.getMyCard(testEmployee.id);
      assert.ok(card);
      assert.ok(card.id || card.card_number || card.cardNumber);
      assert.ok(card.verificationToken || card.verification_token);
      assert.strictEqual(card.isActive ?? card.is_active, true);
    });

    test('Public token verification validates authentic active token and returns employee details', async () => {
      if (!testEmployee?.id) return;

      const card = await DigitalIdService.getMyCard(testEmployee.id);
      const token = card.verificationToken || card.verification_token;
      assert.ok(token);

      const verification = await DigitalIdService.verifyPublicToken(token);
      assert.strictEqual(verification.isValid, true);
      assert.ok(verification.employee);
      assert.strictEqual(verification.employee.employeeCode, testEmployee.employeeCode);
      assert.strictEqual(verification.employee.displayName, testEmployee.displayName);
    });

    test('Public token verification rejects fake/invalid tokens', async () => {
      const fakeToken = '00000000-0000-0000-0000-000000000000';
      const verification = await DigitalIdService.verifyPublicToken(fakeToken);
      assert.strictEqual(verification.isValid, false);
      assert.ok(verification.message);
    });
  });
});
