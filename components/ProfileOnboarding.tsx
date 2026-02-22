
import React, { useState, useRef } from 'react';
import { DriverProfile } from '../types';
import { COLORS, ICONS } from '../constants';
import { verifyDocument } from '../services/geminiService';
import { auth } from '../services/firebase';
import { firestoreService } from '../services/firestoreService';
import AuthVerification from './AuthVerification';

interface ProfileOnboardingProps {
  onComplete: (profile: DriverProfile, role: 'driver' | 'passenger') => void;
}

const ProfileOnboarding: React.FC<ProfileOnboardingProps> = ({ onComplete }) => {
  const [role, setRole] = useState<'driver' | 'passenger' | null>(null);
  const [step, setStep] = useState(-1); // -1: Role, 0: Phone/OTP, 1: Info, 2: NIN, 3: Car
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{ verified: boolean; message: string } | null>(null);
  
  const [formData, setFormData] = useState({
    full_name: '',
    email: auth?.currentUser?.email || '',
    phone: auth?.currentUser?.phoneNumber || '',
    car_make: '',
    car_model: '',
    plate_number: '',
    nin_image: '',
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleRoleSelect = (selectedRole: 'driver' | 'passenger') => {
    setRole(selectedRole);
    // If already authenticated, skip step 0 (AuthVerification)
    if (auth?.currentUser) {
      setStep(1);
    } else {
      setStep(0);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = reader.result as string;
      setFormData(prev => ({ ...prev, nin_image: base64String }));
      setIsVerifying(true);
      
      const result = await verifyDocument(base64String, 'nin', formData.full_name);
      setVerificationResult(result);
      setIsVerifying(false);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = () => {
    const userId = auth?.currentUser?.uid || 'u-' + Math.random().toString(36).substr(2, 5);
    onComplete({
      user_id: userId,
      full_name: formData.full_name,
      phone_number: formData.phone || 'N/A',
      car_make: formData.car_make || 'N/A',
      car_model: formData.car_model || 'N/A',
      car_color: 'Standard',
      plate_number: formData.plate_number || 'N/A',
      verification_status: { 
        phone: true, 
        id: verificationResult?.verified || false, 
        first_trip: false 
      },
      rating: 5.0,
      trip_count: 0,
      wallet_balance: 0,
      total_earnings: 0,
    }, role!);
  };

  return (
    <div className="max-w-md mx-auto min-h-screen bg-white flex flex-col text-black">
      {step >= 0 && (
        <div className="w-full bg-slate-100 h-2">
          <div 
            className="h-full bg-emerald-600 transition-all duration-500" 
            style={{ width: `${((step + 1) / 5) * 100}%` }} 
          />
        </div>
      )}

      <div className="flex-1 p-8 space-y-8 overflow-y-auto">
        {step === -1 && (
          <div className="space-y-8 animate-in slide-in-from-bottom-4 flex flex-col items-center justify-center min-h-[70vh]">
            <header className="text-center space-y-4">
               <div className="mx-auto w-20 h-20 bg-emerald-100 text-emerald-600 rounded-3xl flex items-center justify-center font-black text-4xl shadow-lg border-2 border-emerald-50">R</div>
               <h2 className="text-3xl font-black tracking-tight">Welcome to RouteRider</h2>
               <p className="text-gray-500 font-bold px-4">The easiest way to commute between Daura and Katsina.</p>
            </header>
            
            <div className="w-full space-y-4">
              <button 
                onClick={() => handleRoleSelect('driver')}
                className="w-full p-6 bg-white border-2 border-slate-100 rounded-3xl flex items-center gap-4 hover:border-emerald-500 transition-all text-left group"
              >
                <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl group-hover:scale-110 transition-all">{ICONS.Car}</div>
                <div>
                  <h3 className="font-black text-lg">I am a Driver</h3>
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-tight">Fill seats & offset fuel</p>
                </div>
              </button>

              <button 
                onClick={() => handleRoleSelect('passenger')}
                className="w-full p-6 bg-white border-2 border-slate-100 rounded-3xl flex items-center gap-4 hover:border-emerald-500 transition-all text-left group"
              >
                <div className="p-4 bg-amber-50 text-amber-600 rounded-2xl group-hover:scale-110 transition-all">{ICONS.User}</div>
                <div>
                  <h3 className="font-black text-lg">I am a Passenger</h3>
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-tight">Find affordable rides</p>
                </div>
              </button>
            </div>
          </div>
        )}

        {step === 0 && (
          <AuthVerification 
            onVerified={async (identifier) => {
              if (identifier.includes('@')) {
                setFormData(prev => ({ ...prev, email: identifier }));
              } else {
                setFormData(prev => ({ ...prev, phone: identifier }));
              }
              
              // Check if user already has a profile in Firestore
              if (auth?.currentUser) {
                setIsVerifying(true);
                try {
                  const existingProfile = await firestoreService.getUserProfile(auth.currentUser.uid);
                  if (existingProfile) {
                    // Returning user found! Complete onboarding immediately.
                    onComplete({
                      user_id: auth.currentUser.uid,
                      full_name: existingProfile.full_name,
                      phone_number: existingProfile.phone_number || existingProfile.phone || 'N/A',
                      car_make: existingProfile.car_make || 'N/A',
                      car_model: existingProfile.car_model || 'N/A',
                      car_color: existingProfile.car_color || 'Standard',
                      plate_number: existingProfile.plate_number || 'N/A',
                      verification_status: existingProfile.verification_status || { phone: true, id: true, first_trip: false },
                      rating: existingProfile.rating || 5.0,
                      trip_count: existingProfile.trip_count || 0,
                      wallet_balance: existingProfile.wallet_balance || 0,
                      total_earnings: existingProfile.total_earnings || 0,
                      profile_photo_url: existingProfile.profile_photo_url
                    }, existingProfile.userType || 'passenger');
                    return;
                  }
                } catch (err) {
                  console.error("Error checking existing profile:", err);
                } finally {
                  setIsVerifying(false);
                }
              }
              
              setStep(1);
            }} 
            onBack={() => setStep(-1)}
          />
        )}

        {step === 1 && (
          <div className="space-y-8 animate-in slide-in-from-right-4">
             <header className="text-center space-y-2">
               <h2 className="text-3xl font-black text-black">Basic Info</h2>
               <p className="text-gray-500 font-bold">What should we call you?</p>
             </header>
             <div className="space-y-4">
                <input 
                  placeholder="Full Name" 
                  value={formData.full_name}
                  onChange={e => setFormData({...formData, full_name: e.target.value})} 
                  className="w-full p-5 bg-slate-50 border-2 border-slate-200 rounded-2xl font-black text-lg outline-none focus:border-emerald-500 transition-all" 
                />
                <input 
                  placeholder="Email Address" 
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})} 
                  className="w-full p-5 bg-slate-50 border-2 border-slate-200 rounded-2xl font-black text-lg outline-none focus:border-emerald-500 transition-all" 
                />
                <input 
                  placeholder="Phone Number (Optional)" 
                  value={formData.phone}
                  onChange={e => setFormData({...formData, phone: e.target.value})} 
                  className="w-full p-5 bg-slate-50 border-2 border-slate-200 rounded-2xl font-black text-lg outline-none focus:border-emerald-500 transition-all" 
                />
                <button 
                  onClick={() => {
                    if (role === 'passenger') handleSubmit();
                    else setStep(2);
                  }} 
                  disabled={!formData.full_name}
                  className="w-full bg-emerald-600 text-white p-5 rounded-2xl font-black text-xl shadow-xl shadow-emerald-200 disabled:opacity-50"
                >
                  {role === 'passenger' ? 'Finish Signup' : 'Next: Identity Verification'}
                </button>
             </div>
          </div>
        )}

        {step === 2 && role === 'driver' && (
          <div className="space-y-8 animate-in slide-in-from-right-4">
            <header className="space-y-2 text-center">
              <h2 className="text-3xl font-black">NIN Verification</h2>
              <p className="text-gray-500 font-bold">We use AI to verify your National Identity Number for safety.</p>
            </header>

            <div className="space-y-6">
              <div 
                className={`relative w-full aspect-video border-4 border-dashed rounded-3xl flex flex-col items-center justify-center overflow-hidden transition-all ${
                  formData.nin_image ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-slate-50'
                }`}
              >
                {formData.nin_image ? (
                  <img src={formData.nin_image} className="w-full h-full object-cover" alt="NIN Preview" />
                ) : (
                  <div className="text-center space-y-2 text-slate-400">
                    <div className="flex justify-center">{ICONS.Car}</div>
                    <p className="font-black text-xs uppercase tracking-widest">Snap or Upload NIN</p>
                  </div>
                )}
                
                {isVerifying && (
                  <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center space-y-3 p-6 text-center">
                    <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="font-black text-emerald-800 animate-pulse">Gemini AI is analyzing your document...</p>
                  </div>
                )}
              </div>

              {verificationResult && (
                <div className={`p-4 rounded-2xl flex items-start gap-3 border-2 ${
                  verificationResult.verified ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-700'
                }`}>
                  <div className="mt-0.5">{verificationResult.verified ? ICONS.Check : ICONS.Alert}</div>
                  <div>
                    <p className="font-black text-sm uppercase tracking-tight">{verificationResult.verified ? 'Verified Successfully' : 'Verification Failed'}</p>
                    <p className="text-xs font-bold leading-relaxed">{verificationResult.message}</p>
                  </div>
                </div>
              )}

              <input 
                type="file" 
                accept="image/*" 
                capture="environment" 
                ref={fileInputRef} 
                className="hidden" 
                onChange={handleFileUpload} 
              />

              <div className="space-y-3">
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isVerifying}
                  className="w-full bg-slate-900 text-white p-5 rounded-2xl font-black flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  {formData.nin_image ? 'Retake Photo' : 'Capture NIN Card'}
                </button>

                <button 
                  onClick={() => setStep(3)}
                  disabled={!verificationResult?.verified || isVerifying}
                  className="w-full bg-emerald-600 text-white p-5 rounded-2xl font-black text-xl shadow-xl shadow-emerald-200 disabled:opacity-30 transition-all"
                >
                  Proceed to Car Details
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 3 && role === 'driver' && (
          <div className="space-y-8 animate-in slide-in-from-right-4">
            <header className="space-y-2">
              <h2 className="text-3xl font-black">Car Details</h2>
              <p className="text-gray-500 font-bold">Passengers look for these details at pickup.</p>
            </header>
            <div className="space-y-4">
              <input 
                placeholder="Make (e.g. Toyota)" 
                value={formData.car_make} 
                onChange={e => setFormData({...formData, car_make: e.target.value})} 
                className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-black focus:border-emerald-500 outline-none" 
              />
              <input 
                placeholder="Model (e.g. Corolla)" 
                value={formData.car_model} 
                onChange={e => setFormData({...formData, car_model: e.target.value})} 
                className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-black focus:border-emerald-500 outline-none" 
              />
              <input 
                placeholder="License Plate" 
                value={formData.plate_number} 
                onChange={e => setFormData({...formData, plate_number: e.target.value})} 
                className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-black focus:border-emerald-500 outline-none" 
              />
              <button onClick={handleSubmit} disabled={!formData.plate_number} className="w-full bg-emerald-600 text-white p-5 rounded-2xl font-black text-xl shadow-xl shadow-emerald-600/20 active:scale-[0.98] transition-all disabled:opacity-50">Finish Driver Signup</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfileOnboarding;
