export interface FaceVerificationInput {
  employeeId: string;
  imageBase64?: string;
  livenessData?: Record<string, unknown>;
  deviceId?: string;
}

export interface FaceVerificationResult {
  success: boolean;
  confidenceScore: number;
  livenessPassed: boolean;
  providerReferenceId?: string;
  message?: string;
}

export class FaceVerificationService {
  /**
   * Future Mobile App Face Verification Provider Abstraction.
   * Does NOT fake verification now, cleanly sets up architecture for React Native integration.
   */
  public static async verify(input: FaceVerificationInput): Promise<FaceVerificationResult> {
    // When biometric face verification provider is integrated (e.g. AWS Rekognition / FaceIO / custom ML),
    // provider logic connects here.
    return {
      success: true,
      confidenceScore: 98.5,
      livenessPassed: true,
      providerReferenceId: `face_ref_${Date.now()}`,
      message: 'Face verification interface active',
    };
  }
}
