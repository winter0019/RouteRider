
import React from 'react';
import { DriverProfile } from '../types';
import { ICONS } from '../constants';

interface KYCStatusPageProps {
  profile: DriverProfile;
  onRetry: () => void;
  onLogout: () => void;
}

const KYCStatusPage: React.FC<KYCStatusPageProps> = ({ profile, onRetry, onLogout }) => {
  const isPending = profile.kyc_status === 'pending';
  const isFailed = profile.kyc_status === 'failed';

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8 text-center space-y-8 animate-in fade-in duration-500">
      <header className="space-y-4">
        <div className={`mx-auto w-24 h-24 rounded-[2.5rem] flex items-center justify-center text-4xl shadow-2xl border-4 border-white ${
          isPending ? 'bg-brand-secondary/10 text-brand-secondary shadow-brand-secondary/10' : 
          isFailed ? 'bg-red-100 text-red-600 shadow-red-100' : 
          'bg-slate-100 text-slate-600 shadow-slate-100'
        }`}>
          {isPending ? ICONS.Clock : isFailed ? ICONS.Alert : ICONS.User}
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-black tracking-tight text-slate-900">
            {isPending ? 'Verification Pending' : isFailed ? 'Verification Failed' : 'Action Required'}
          </h1>
          <p className="text-gray-500 font-bold text-sm uppercase tracking-widest">
            {profile.full_name}
          </p>
        </div>
      </header>

      <div className="max-w-xs space-y-4">
        <p className="text-slate-600 font-bold leading-relaxed">
          {isPending 
            ? "Our AI is currently reviewing your documents. This usually takes less than 2 minutes. Please check back shortly." 
            : isFailed 
            ? "We couldn't verify your identity with the documents provided. Please ensure your NIN is clear and matches your selfie." 
            : "You need to complete your identity verification before you can access the dashboard."}
        </p>

        {isFailed && (
          <div className="bg-red-50 border border-red-100 p-4 rounded-2xl text-red-700 text-xs font-bold text-left space-y-1">
            <p className="uppercase tracking-tight">Reason for failure:</p>
            <p className="opacity-80">Document image was blurry or name mismatch detected.</p>
          </div>
        )}
      </div>

      <div className="w-full max-w-xs space-y-3">
        {isFailed && (
          <button 
            onClick={onRetry}
            className="w-full bg-brand-primary text-white p-5 rounded-2xl font-black text-lg shadow-xl shadow-brand-primary/20 active:scale-[0.98] transition-all"
          >
            Try Again
          </button>
        )}
        
        {isPending && (
          <button 
            onClick={() => window.location.reload()}
            className="w-full bg-slate-900 text-white p-5 rounded-2xl font-black text-lg shadow-xl shadow-slate-200 active:scale-[0.98] transition-all"
          >
            Refresh Status
          </button>
        )}

        <button 
          onClick={onLogout}
          className="w-full bg-white border-2 border-slate-100 text-slate-500 p-5 rounded-2xl font-black text-lg hover:bg-slate-50 active:scale-[0.98] transition-all"
        >
          Sign Out
        </button>
      </div>

      <footer className="pt-8">
        <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">
          Secure Identity Verification by Gemini AI
        </p>
      </footer>
    </div>
  );
};

export default KYCStatusPage;
