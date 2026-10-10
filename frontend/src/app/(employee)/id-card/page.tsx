'use client';

import React, { useEffect, useState, useRef } from 'react';
import Image from 'next/image';
import QRCode from 'qrcode';
import { digitalIdApi } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { DigitalIdCard } from '@/types';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/ui/loading-state';
import { formatDate } from '@/lib/utils';
import {
  Printer,
  ShieldCheck,
  ShieldAlert,
  Copy,
  Check,
  ExternalLink,
  QrCode,
  Sparkles,
} from 'lucide-react';

export default function DigitalIdPage() {
  const { user } = useAuth();
  const [card, setCard] = useState<DigitalIdCard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  // Fetch digital ID card
  useEffect(() => {
    let isMounted = true;
    async function loadCard() {
      try {
        setError(null);
        const data = await digitalIdApi.getMyCard();
        if (isMounted) {
          setCard(data);
        }
      } catch (err: any) {
        if (isMounted) {
          console.error('Failed to load digital ID card:', err);
          setError(err.message || 'Unable to load digital ID card');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }
    loadCard();

    // Listen for profile photo / user updates
    const handleUserUpdate = () => {
      loadCard();
    };
    window.addEventListener('auth:user-updated', handleUserUpdate);

    return () => {
      isMounted = false;
      window.removeEventListener('auth:user-updated', handleUserUpdate);
    };
  }, []);

  // Compute verification URL
  const verificationUrl =
    typeof window !== 'undefined' && card?.verificationToken
      ? `${window.location.origin}/verify-id/${card.verificationToken}`
      : '';

  // Generate real, scannable QR code
  useEffect(() => {
    if (!verificationUrl) return;

    let isCancelled = false;
    QRCode.toDataURL(verificationUrl, {
      width: 360,
      margin: 1,
      color: {
        dark: '#111111',
        light: '#FFFFFF',
      },
      errorCorrectionLevel: 'M',
    })
      .then((url) => {
        if (!isCancelled) {
          setQrCodeDataUrl(url);
        }
      })
      .catch((err) => {
        console.error('Failed to generate verification QR code:', err);
      });

    return () => {
      isCancelled = true;
    };
  }, [verificationUrl]);

  // Handle printing
  const handlePrint = () => {
    if (!qrCodeDataUrl && verificationUrl) {
      // If QR code is still generating, wait briefly
      QRCode.toDataURL(verificationUrl, {
        width: 360,
        margin: 1,
        color: { dark: '#111111', light: '#FFFFFF' },
      }).then((url) => {
        setQrCodeDataUrl(url);
        setTimeout(() => window.print(), 150);
      });
      return;
    }
    window.print();
  };

  const handleCopyLink = () => {
    if (!verificationUrl) return;
    navigator.clipboard.writeText(verificationUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return <LoadingState message="Loading Digital ID Card..." />;
  }

  // Resolved employee data hierarchy (card.employee > user session fallback)
  const photoUrl = card?.employee?.profilePhotoUrl || user?.profilePhotoUrl || null;
  const fullName = card?.employee?.displayName || user?.displayName || 'Employee Name';
  const designation = card?.employee?.designation?.name || user?.designationName || 'Corporate Professional';
  const department = card?.employee?.department?.name || user?.departmentName || 'Techy Arts';
  const employeeCode = card?.employee?.employeeCode || user?.employeeCode || 'EMP-101';
  const cardNumber = card?.cardNumber || (user?.employeeCode ? `ID-${user.employeeCode}` : 'ID-EMP-001');
  const isActive = Boolean(card ? card.isActive : true);
  const issuedDate = card?.issuedAt ? formatDate(card.issuedAt) : formatDate(new Date());

  return (
    <>
      {/* Print stylesheet */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 1cm;
          }
          /* Hide non-printable elements */
          header,
          nav,
          aside,
          footer,
          button,
          .no-print,
          [role='banner'],
          [role='navigation'] {
            display: none !important;
          }
          body {
            background: #ffffff !important;
            color: #111111 !important;
            padding: 0 !important;
            margin: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          main {
            padding: 0 !important;
            margin: 0 !important;
            max-width: 100% !important;
          }
          .id-card-print-container {
            display: flex !important;
            justify-content: center !important;
            align-items: center !important;
            min-height: 90vh !important;
            padding: 0 !important;
            margin: 0 auto !important;
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
          }
          #digital-id-card-printable {
            box-shadow: none !important;
            border: 2px solid #111111 !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            margin: 0 auto !important;
            width: 3.375in !important;
            max-width: 3.375in !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>

      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Page Header (Hidden during print) */}
        <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-200">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight text-neutral-900">Digital Employee ID</h1>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-neutral-900 text-white">
                <Sparkles className="w-2.5 h-2.5 text-[#D4AF37]" /> Corporate ID
              </span>
            </div>
            <p className="text-xs text-neutral-500 mt-1">
              Official verifiable company identification and electronic credential badge.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {verificationUrl && (
              <Button
                onClick={handleCopyLink}
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs border-neutral-300 text-neutral-700 hover:bg-neutral-100"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Link Copied' : 'Copy Verification Link'}
              </Button>
            )}

            <Button
              onClick={handlePrint}
              size="sm"
              className="gap-1.5 text-xs bg-neutral-900 hover:bg-black text-white shadow-sm"
            >
              <Printer className="w-3.5 h-3.5" /> Print / Save Badge
            </Button>
          </div>
        </div>

        {/* Presentation Area */}
        <div className="id-card-print-container flex justify-center py-6 sm:py-10 bg-neutral-100/70 dark:bg-neutral-900/40 rounded-2xl border border-neutral-200/80 shadow-inner">
          {/* ============================================================== */}
          {/* PREMIUM TECHY ARTS DIGITAL ID BADGE (PRINTABLE TARGET)         */}
          {/* ============================================================== */}
          <div
            id="digital-id-card-printable"
            className="w-full max-w-[360px] sm:max-w-[375px] bg-white rounded-2xl border-2 border-[#111111] shadow-2xl p-5 sm:p-6 text-center space-y-4 relative overflow-hidden font-sans text-neutral-900"
          >
            {/* Lanyard Slot Cutout Accent */}
            <div className="w-12 h-1.5 rounded-full bg-neutral-200/90 border border-neutral-300 mx-auto -mt-1 mb-2 no-print" />

            {/* Subtle Gold Edge Highlight */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-[#D4AF37]" />

            {/* CARD HEADER */}
            <div className="flex items-center justify-between pb-3">
              <div className="flex items-center gap-2.5 text-left">
                <div className="w-8 h-8 rounded-lg bg-[#111111] border border-neutral-800 flex items-center justify-center p-1 shadow-sm">
                  <Image
                    src="/images/logo.png"
                    alt="Techy Arts Logo"
                    width={24}
                    height={24}
                    className="object-contain"
                    priority
                  />
                </div>
                <div>
                  <h3 className="font-black text-sm tracking-widest text-[#111111] leading-none">TECHY ARTS</h3>
                  <span className="text-[9px] uppercase tracking-widest text-neutral-400 font-bold block mt-0.5">
                    EMPLOYEE ID
                  </span>
                </div>
              </div>

              {/* Status Indicator */}
              <div
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase border ${
                  isActive
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : 'bg-rose-50 text-rose-800 border-rose-300'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isActive ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                  }`}
                />
                {isActive ? 'ACTIVE' : 'INACTIVE'}
              </div>
            </div>

            {/* Thin Gold Brand Divider */}
            <div className="w-full h-[1.5px] bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent opacity-80" />

            {/* EMPLOYEE PHOTO (PORTRAIT RECTANGULAR FRAME) */}
            <div className="pt-1">
              <div className="relative mx-auto w-32 h-40 sm:w-36 sm:h-44 rounded-xl p-[2px] bg-gradient-to-b from-[#D4AF37] via-neutral-300 to-[#111111] shadow-md">
                <div className="w-full h-full rounded-[10px] overflow-hidden bg-neutral-900 flex items-center justify-center relative">
                  {photoUrl && !imageError ? (
                    <img
                      src={photoUrl}
                      alt={fullName}
                      className="w-full h-full object-cover object-center"
                      onError={() => setImageError(true)}
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-neutral-800 to-[#111111] text-white p-3">
                      <div className="w-16 h-16 rounded-full border-2 border-[#D4AF37]/70 flex items-center justify-center mb-1.5 bg-neutral-800/80 shadow-inner">
                        <span className="text-2xl font-black text-[#D4AF37]">
                          {fullName.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <span className="text-[9px] font-mono tracking-widest text-neutral-400 uppercase">
                        INITIAL AVATAR
                      </span>
                    </div>
                  )}

                  {/* Holographic Watermark Badge */}
                  <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm border border-[#D4AF37]/30 text-[8px] font-mono font-bold text-[#D4AF37]">
                    TA-ID
                  </div>
                </div>
              </div>
            </div>

            {/* EMPLOYEE NAME & ROLES */}
            <div className="space-y-0.5 px-2">
              <h2 className="text-xl sm:text-2xl font-black text-[#111111] tracking-tight leading-snug break-words">
                {fullName}
              </h2>
              <p className="text-xs sm:text-sm font-bold text-[#D4AF37] uppercase tracking-wider break-words">
                {designation}
              </p>
              <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-widest break-words">
                {department}
              </p>
            </div>

            {/* EMPLOYEE INFORMATION PANEL */}
            <div className="grid grid-cols-2 gap-2.5 p-3 rounded-xl bg-neutral-50 border border-neutral-200/90 text-left text-xs">
              <div className="overflow-hidden">
                <span className="text-[9px] uppercase font-bold tracking-wider text-neutral-400 block">
                  EMPLOYEE CODE
                </span>
                <span className="font-mono font-black text-[#111111] text-xs sm:text-sm tracking-tight truncate block">
                  {employeeCode}
                </span>
              </div>
              <div className="overflow-hidden">
                <span className="text-[9px] uppercase font-bold tracking-wider text-neutral-400 block">
                  CARD NUMBER
                </span>
                <span className="font-mono font-black text-[#111111] text-xs sm:text-sm tracking-tight truncate block">
                  {cardNumber}
                </span>
              </div>
            </div>

            {/* QR VERIFICATION SECTION */}
            <div className="flex items-center gap-3 p-3 rounded-xl border border-neutral-200 bg-white shadow-sm text-left">
              <div className="w-20 h-20 sm:w-22 sm:h-22 bg-white rounded-lg border border-neutral-200 p-1 flex-shrink-0 flex items-center justify-center shadow-inner">
                {qrCodeDataUrl ? (
                  <img
                    src={qrCodeDataUrl}
                    alt="Scannable Employee ID Verification QR Code"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-neutral-100 rounded">
                    <QrCode className="w-8 h-8 text-neutral-400 animate-pulse" />
                  </div>
                )}
              </div>

              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-1.5 text-emerald-800">
                  <ShieldCheck className="w-4 h-4 flex-shrink-0 text-emerald-600" />
                  <span className="text-[11px] font-bold tracking-wide uppercase">VERIFIED IDENTITY</span>
                </div>
                <p className="text-[10px] text-neutral-500 font-medium leading-tight">
                  Scan code with any mobile camera to verify employment and credential validity.
                </p>
                <div className="flex items-center gap-1.5 pt-0.5">
                  <span className="inline-block text-[9px] font-mono tracking-widest text-[#111111] font-extrabold uppercase bg-neutral-100 px-1.5 py-0.5 rounded border border-neutral-300">
                    SCAN TO VERIFY
                  </span>
                </div>
              </div>
            </div>

            {/* CARD FOOTER */}
            <div className="pt-2 border-t border-neutral-100 text-[10px] text-neutral-500 flex items-center justify-between px-1">
              <span>
                Issued: <strong className="text-neutral-800 font-medium">{issuedDate}</strong>
              </span>
              <span className="flex items-center gap-1.5 font-bold text-neutral-800 tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37]" />
                TECHY ARTS
              </span>
            </div>
          </div>
        </div>

        {/* Verification Link Helper Box (Hidden during print) */}
       
      </div>
    </>
  );
}
