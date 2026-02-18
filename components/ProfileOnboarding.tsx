
import React, { useState, useRef, useEffect } from 'react';
import { DriverProfile } from '../types';
import { COLORS, ICONS } from '../constants';
import { verifyDocument } from '../services/geminiService';

interface ProfileOnboardingProps {
  onComplete: (profile: DriverProfile, role: 'driver' | 'passenger') => void;
}

const ProfileOnboarding: React.FC<ProfileOnboardingProps> = ({ onComplete }) => {
  const [role, setRole] = useState<'driver' | 'passenger' | null>(null);
  const [step, setStep] = useState(-1); // -1: Role, 0: Phone...
  const [formData, setFormData] = useState({
    full_name: '',
    phone: '',
    otp: '',
    car_make: '',
    car_model: '',
    plate_number: '',
  });

  const handleSubmit = () => {
    onComplete({
      user_id: 'u-' + Math.random().toString(36).substr(2, 5),
      full_name: formData.full_name,
      phone_number: formData.phone,
      car_make: formData.car_make || 'N/A',
      car_model: formData.car_model || 'N/A',
      car_color: 'Standard',
      plate_number: formData.plate_number || 'N/A',
      verification_status: { phone: true, id: true, first_trip: false },
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
          <div className="h-full bg-emerald-600 transition-all duration-500" style={{ width: `${(step / 4) * 100}%` }} />
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
                onClick={() => { setRole('driver'); setStep(0); }}
                className="w-full p-6 bg-white border-2 border-slate-100 rounded-3xl flex items-center gap-4 hover:border-emerald-500 transition-all text-left group"
              >
                <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl group-hover:scale-110 transition-all">{ICONS.Car}</div>
                <div>
                  <h3 className="font-black text-lg">I am a Driver</h3>
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-tight">Fill seats & offset fuel</p>
                </div>
              </button>

              <button 
                onClick={() => { setRole('passenger'); setStep(0); }}
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
          <div className="space-y-8 animate-in slide-in-from-right-4">
             <header className="text-center space-y-2">
               <h2 className="text-3xl font-black">Enter Phone</h2>
               <p className="text-gray-500 font-bold">Sign up with your Nigerian phone number.</p>
             </header>
             <div className="space-y-4">
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-gray-400">+234</span>
                  <input type="tel" placeholder="902 874 3008" onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full p-5 pl-16 bg-slate-50 border-2 border-slate-200 rounded-2xl font-black text-lg outline-none" />
                </div>
                <button onClick={() => setStep(1)} className="w-full bg-emerald-600 text-white p-5 rounded-2xl font-black text-xl shadow-xl shadow-emerald-200">Continue</button>
             </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-8 animate-in slide-in-from-right-4">
             <header className="text-center space-y-2">
               <h2 className="text-3xl font-black text-black">Basic Info</h2>
               <p className="text-gray-500 font-bold">What should we call you?</p>
             </header>
             <div className="space-y-4">
                <input placeholder="Full Name" onChange={e => setFormData({...formData, full_name: e.target.value})} className="w-full p-5 bg-slate-50 border-2 border-slate-200 rounded-2xl font-black text-lg outline-none" />
                <button onClick={() => {
                  if (role === 'passenger') handleSubmit();
                  else setStep(3);
                }} className="w-full bg-emerald-600 text-white p-5 rounded-2xl font-black text-xl shadow-xl shadow-emerald-200">
                  {role === 'passenger' ? 'Finish Signup' : 'Next: Car Details'}
                </button>
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
              <input placeholder="Make (e.g. Toyota)" value={formData.car_make} onChange={e => setFormData({...formData, car_make: e.target.value})} className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-black focus:border-emerald-500 outline-none" />
              <input placeholder="Model (e.g. Corolla)" value={formData.car_model} onChange={e => setFormData({...formData, car_model: e.target.value})} className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-black focus:border-emerald-500 outline-none" />
              <input placeholder="License Plate" value={formData.plate_number} onChange={e => setFormData({...formData, plate_number: e.target.value})} className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-black focus:border-emerald-500 outline-none" />
              <button onClick={handleSubmit} disabled={!formData.plate_number} className="w-full bg-emerald-600 text-white p-5 rounded-2xl font-black text-xl shadow-xl shadow-emerald-600/20 active:scale-[0.98] transition-all">Finish Driver Signup</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfileOnboarding;
