import { prisma } from '../../plugins/prisma.js';
import { DbService } from '../../services/db.service.js';

export class DigitalIdService {
  public static async getMyCard(employeeId: string) {
    return DbService.query(
      async () => {
        let card = await prisma.digitalIdCard.findUnique({
          where: { employeeId },
          include: {
            employee: {
              include: { department: true, designation: true },
            },
          },
        });

        if (!card) {
          const emp = await prisma.employee.findUnique({ where: { id: employeeId } });
          if (!emp) throw new Error('Employee not found');
          card = await prisma.digitalIdCard.create({
            data: {
              employeeId,
              cardNumber: `ID-${emp.employeeCode}`,
              isActive: true,
            },
            include: {
              employee: { include: { department: true, designation: true } },
            },
          });
        }

        return card;
      },
      async () => {
        let cards = await DbService.restRequest<any[]>(
          `/digital_id_cards?employee_id=eq.${employeeId}&select=*,employee:employees(*,department:departments(*),designation:designations(*))`
        );
        if (!cards || cards.length === 0) {
          const emp = await DbService.restRequest<any[]>(`/employees?id=eq.${employeeId}`);
          if (emp?.[0]) {
            cards = await DbService.restRequest<any[]>('/digital_id_cards', {
              method: 'POST',
              body: {
                employee_id: employeeId,
                card_number: `ID-${emp[0].employeeCode || emp[0].employee_code || 'EMP'}`,
                is_active: true,
              },
            });
            // Re-fetch with joins
            cards = await DbService.restRequest<any[]>(
              `/digital_id_cards?employee_id=eq.${employeeId}&select=*,employee:employees(*,department:departments(*),designation:designations(*))`
            );
          }
        }
        return cards?.[0] || null;
      }
    );
  }

  /**
   * Public Safe Token Verification (No sensitive PII exposed)
   */
  public static async verifyPublicToken(token: string) {
    return DbService.query(
      async () => {
        const card = await prisma.digitalIdCard.findUnique({
          where: { verificationToken: token },
          include: {
            employee: {
              include: { department: true, designation: true },
            },
          },
        });

        if (!card || !card.isActive || card.employee.employmentStatus !== 'ACTIVE') {
          return {
            isValid: false,
            message: 'Invalid or deactivated employee credential',
          };
        }

        return {
          isValid: true,
          employee: {
            displayName: card.employee.displayName,
            employeeCode: card.employee.employeeCode,
            department: card.employee.department?.name || 'General',
            designation: card.employee.designation?.name || 'Staff',
            profilePhotoUrl: card.employee.profilePhotoUrl,
            joiningDate: card.employee.joiningDate,
            cardNumber: card.cardNumber,
            issuedAt: card.issuedAt,
          },
        };
      },
      async () => {
        const cards = await DbService.restRequest<any[]>(
          `/digital_id_cards?verification_token=eq.${token}&select=*,employee:employees(*,department:departments(*),designation:designations(*))`
        );
        const card = cards?.[0];
        const isActive = card?.isActive ?? card?.is_active ?? false;
        const emp = card?.employee;
        const empStatus = emp?.employmentStatus ?? emp?.employment_status;
        if (!card || !isActive || empStatus !== 'ACTIVE') {
          return { isValid: false, message: 'Invalid or deactivated employee credential' };
        }
        return {
          isValid: true,
          employee: {
            displayName: emp?.displayName || emp?.display_name || 'Employee',
            employeeCode: emp?.employeeCode || emp?.employee_code || '',
            department: emp?.department?.name || 'General',
            designation: emp?.designation?.name || 'Staff',
            profilePhotoUrl: emp?.profilePhotoUrl || emp?.profile_photo_url,
            cardNumber: card.cardNumber || card.card_number,
          },
        };
      }
    );
  }
}
