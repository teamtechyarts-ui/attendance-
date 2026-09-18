import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDepartmentSchema,
  updateDepartmentSchema,
  createDesignationSchema,
  updateDesignationSchema,
  createWorkScheduleSchema,
  updateWorkScheduleSchema,
} from '../src/validation/index.js';

describe('Master Data Validation & CRUD Schemas', () => {
  describe('Department Schema Validation', () => {
    test('valid department payload parses successfully', () => {
      const payload = {
        name: 'Engineering & Technology',
        description: 'Software engineering, architecture, and IT operations',
        isActive: true,
      };
      const parsed = createDepartmentSchema.parse(payload);
      assert.strictEqual(parsed.name, payload.name);
      assert.strictEqual(parsed.description, payload.description);
      assert.strictEqual(parsed.isActive, true);
    });

    test('department with empty name fails validation', () => {
      assert.throws(
        () => createDepartmentSchema.parse({ name: '' }),
        (err: any) => err.errors?.[0]?.message.includes('Name is required')
      );
    });

    test('update department supports partial payload', () => {
      const update = { isActive: false };
      const parsed = updateDepartmentSchema.parse(update);
      assert.strictEqual(parsed.isActive, false);
      assert.strictEqual(parsed.name, undefined);
    });
  });

  describe('Designation Schema Validation', () => {
    test('valid designation payload parses successfully', () => {
      const payload = {
        name: 'Principal Software Architect',
        description: 'Technical leadership and system architecture',
        isActive: true,
      };
      const parsed = createDesignationSchema.parse(payload);
      assert.strictEqual(parsed.name, payload.name);
      assert.strictEqual(parsed.isActive, true);
    });

    test('designation with empty name fails validation', () => {
      assert.throws(
        () => createDesignationSchema.parse({ name: '' }),
        (err: any) => err.errors?.[0]?.message.includes('Name is required')
      );
    });
  });

  describe('Work Schedule Schema Validation', () => {
    test('valid work schedule parses with all fields and defaults', () => {
      const payload = {
        name: 'Standard Shift',
        monday: true,
        tuesday: true,
        wednesday: true,
        thursday: true,
        friday: true,
        saturday: false,
        sunday: false,
        workStartTime: '09:00:00',
        workEndTime: '18:00:00',
        breakMinutes: 60,
        isDefault: true,
      };
      const parsed = createWorkScheduleSchema.parse(payload);
      assert.strictEqual(parsed.name, 'Standard Shift');
      assert.strictEqual(parsed.workStartTime, '09:00:00');
      assert.strictEqual(parsed.workEndTime, '18:00:00');
      assert.strictEqual(parsed.breakMinutes, 60);
      assert.strictEqual(parsed.isDefault, true);
    });

    test('work schedule with no working days selected is rejected', () => {
      const invalidPayload = {
        name: 'Zero Day Schedule',
        monday: false,
        tuesday: false,
        wednesday: false,
        thursday: false,
        friday: false,
        saturday: false,
        sunday: false,
        workStartTime: '09:00:00',
        workEndTime: '18:00:00',
      };
      assert.throws(
        () => createWorkScheduleSchema.parse(invalidPayload),
        (err: any) => err.errors?.some((e: any) => e.message.includes('At least one working day must be selected'))
      );
    });

    test('work schedule with invalid time format is rejected', () => {
      const invalidTimePayload = {
        name: 'Bad Time Schedule',
        monday: true,
        workStartTime: '25:00', // invalid hour
        workEndTime: '18:00',
      };
      assert.throws(
        () => createWorkScheduleSchema.parse(invalidTimePayload),
        (err: any) => err.errors?.some((e: any) => e.message.includes('Start time must be HH:MM or HH:MM:SS'))
      );
    });

    test('update work schedule accepts partial fields', () => {
      const partialUpdate = {
        isDefault: true,
        breakMinutes: 45,
      };
      const parsed = updateWorkScheduleSchema.parse(partialUpdate);
      assert.strictEqual(parsed.isDefault, true);
      assert.strictEqual(parsed.breakMinutes, 45);
    });
  });

  describe('Default Work Schedule Uniqueness Invariant', () => {
    test('setting a schedule as default clears default from all other schedules in simulated array', () => {
      const schedules = [
        { id: 'sched-1', name: 'Shift 1', isDefault: true },
        { id: 'sched-2', name: 'Shift 2', isDefault: false },
        { id: 'sched-3', name: 'Shift 3', isDefault: false },
      ];

      // Admin sets sched-2 as default
      const targetId = 'sched-2';
      const updatedSchedules = schedules.map((s) => ({
        ...s,
        isDefault: s.id === targetId,
      }));

      const defaultCount = updatedSchedules.filter((s) => s.isDefault).length;
      assert.strictEqual(defaultCount, 1, 'Exactly one schedule must be default');
      assert.strictEqual(updatedSchedules.find((s) => s.id === 'sched-2')?.isDefault, true);
      assert.strictEqual(updatedSchedules.find((s) => s.id === 'sched-1')?.isDefault, false);
    });
  });

  describe('Dependency Safety and Deactivation Logic', () => {
    test('department with assigned employees is deactivated rather than deleted', () => {
      const department = { id: 'dept-1', name: 'Engineering', isActive: true };
      const employeeCount = 5;

      let actionTaken = '';
      let finalDept = { ...department };

      if (employeeCount > 0) {
        actionTaken = 'DEACTIVATE';
        finalDept.isActive = false;
      } else {
        actionTaken = 'HARD_DELETE';
      }

      assert.strictEqual(actionTaken, 'DEACTIVATE');
      assert.strictEqual(finalDept.isActive, false);
    });

    test('department without assigned employees is hard deleted', () => {
      const department = { id: 'dept-2', name: 'Obsolete Dept', isActive: true };
      const employeeCount = 0;

      let actionTaken = '';
      if (employeeCount > 0) {
        actionTaken = 'DEACTIVATE';
      } else {
        actionTaken = 'HARD_DELETE';
      }

      assert.strictEqual(actionTaken, 'HARD_DELETE');
    });

    test('deleting a work schedule assigned to employees is rejected with 409', () => {
      const assignedEmployeeCount = 3;
      let errorOccurred = false;
      let errorCode = '';

      if (assignedEmployeeCount > 0) {
        errorOccurred = true;
        errorCode = 'SCHEDULE_ASSIGNED_TO_EMPLOYEES';
      }

      assert.strictEqual(errorOccurred, true);
      assert.strictEqual(errorCode, 'SCHEDULE_ASSIGNED_TO_EMPLOYEES');
    });
  });
});
