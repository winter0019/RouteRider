
import React, { useState, useRef, useEffect } from 'react';
import { auth, isFirebaseConfigured } from '../services/firebase';
import { RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from 'firebase/auth';
import { ICONS } from '../constants';

interface PhoneVerificationProps {
  onVerified: (phoneNumber: string) => void;
  onBack?: () => void;
}

const PhoneVerification: React.FC<PhoneVerificationProps> = ({ onVerified, onBack }) => {
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  
  const recaptchaVerifier = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    return () => {
      if (recaptchaVerifier.current) {
        recaptchaVerifier.current.clear();
      }
    };
  }, []);

  const setupRecaptcha = () => {
    if (!recaptchaVerifier.current) {
      recaptchaVerifier.current = new RecaptchaVerifier(auth!, 'recaptcha-container', {
        size: 'invisible',
        callback: () => {
          // reCAPTCHA solved
        }
      });
    }
  };

  const handleSendOTP = async () => {
    if (!isFirebaseConfigured() || !auth) {
      setError('Firebase is not configured. Please add your API keys to the environment variables.');
      return;
    }
    
    if (!phoneNumber) {
      setError('Please enter a valid phone number.');
      return;
    }

    try {
      setError(null);
      setIsVerifying(true);
      setupRecaptcha();
      
      const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+234${phoneNumber}`;
      const confirmation = await signInWithPhoneNumber(auth, formattedPhone, recaptchaVerifier.current!);
      setConfirmationResult(confirmation);
      setStep('otp');
    } catch (err: any) {
      console.error('Firebase Auth Error:', err);
      if (err.code === 'auth/invalid-api-key') {
        setError('Invalid Firebase API Key. Please check your configuration.');
      } else if (err.code === 'auth/network-request-failed') {
        setError(`Network error. Please ensure "${window.location.hostname}" is added to "Authorized Domains" in your Firebase Console.`);
      } else {
        setError(err.message || 'Failed to send OTP. Please check the phone number.');
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!otp || otp.length !== 6) {
      setError('Please enter a valid 6-digit code.');
      return;
    }

    try {
      setError(null);
      setIsVerifying(true);
      if (confirmationResult) {
        await confirmationResult.confirm(otp);
        onVerified(phoneNumber);
      }
    } catch (err: any) {
      console.error(err);
      setError('Invalid OTP. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-right-4">
      <div id="recaptcha-container"></div>
      
      {error && (
        <div className="p-4 bg-red-50 border-2 border-red-100 rounded-2xl text-red-700 text-sm font-bold flex items-center gap-2">
          {ICONS.Alert}
          {error}
        </div>
      )}

      {step === 'phone' ? (
        <div className="space-y-8">
          <header className="text-center space-y-2">
            <h2 className="text-3xl font-black">Enter Phone</h2>
            <p className="text-gray-500 font-bold">Sign up with your Nigerian phone number.</p>
          </header>
          <div className="space-y-4">
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-gray-400">+234</span>
              <input 
                type="tel" 
                placeholder="902 874 3008" 
                value={phoneNumber}
                onChange={e => setPhoneNumber(e.target.value)} 
                className="w-full p-5 pl-16 bg-slate-50 border-2 border-slate-200 rounded-2xl font-black text-lg outline-none" 
              />
            </div>
            <button 
              onClick={handleSendOTP} 
              disabled={!phoneNumber || isVerifying} 
              className="w-full bg-emerald-600 text-white p-5 rounded-2xl font-black text-xl shadow-xl shadow-emerald-200 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isVerifying && <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
              Send OTP
            </button>
            {onBack && (
              <button 
                onClick={onBack} 
                className="w-full text-gray-400 font-black text-sm uppercase tracking-wider"
              >
                Go Back
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          <header className="text-center space-y-2">
            <h2 className="text-3xl font-black">Verify OTP</h2>
            <p className="text-gray-500 font-bold">Enter the 6-digit code sent to your phone.</p>
          </header>
          <div className="space-y-4">
            <input 
              type="text" 
              maxLength={6}
              placeholder="123456" 
              value={otp}
              onChange={e => setOtp(e.target.value)} 
              className="w-full p-5 bg-slate-50 border-2 border-slate-200 rounded-2xl font-black text-center text-3xl tracking-[0.5em] outline-none" 
            />
            <button 
              onClick={handleVerifyOTP} 
              disabled={otp.length !== 6 || isVerifying} 
              className="w-full bg-emerald-600 text-white p-5 rounded-2xl font-black text-xl shadow-xl shadow-emerald-200 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isVerifying && <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
              Verify & Continue
            </button>
            <button 
              onClick={() => setStep('phone')} 
              className="w-full text-emerald-600 font-black text-sm uppercase tracking-wider"
            >
              Change Phone Number
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PhoneVerification;
