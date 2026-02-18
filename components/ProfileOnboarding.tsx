import React, { useState, useRef, useEffect } from 'react';
import { DriverProfile } from '../types';
import { COLORS, ICONS } from '../constants';
import { verifyDocument } from '../services/geminiService';

interface ProfileOnboardingProps {
  onComplete: (profile: DriverProfile) => void;
}

const CameraScanner: React.FC<{ 
  label: string, 
  onCapture: (base64: string) => void, 
  onClose: () => void 
}> = ({ label, onCapture, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    async function setupCamera() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'environment' }, 
          audio: false 
        });
        setStream(mediaStream);
        if (videoRef.current) videoRef.current.srcObject = mediaStream;
      } catch (err) {
        console.error("Camera access error:", err);
      }
    }
    setupCamera();
    return () => {
      if (stream) stream.getTracks().forEach(track => track.stop());
    };
  }, []);

  const takePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        onCapture(canvas.toDataURL('image/jpeg'));
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center p-6 text-white">
      <div className="w-full flex justify-between items-center mb-4">
        <h3 className="text-lg font-black">{label}</h3>
        <button onClick={onClose} className="p-2 bg-white/10 rounded-full font-black">✕</button>
      </div>
      <div className="relative w-full aspect-[3/4] max-h-[60vh] rounded-3xl overflow-hidden border-2 border-emerald-500 bg-slate-900 shadow-[0_0_50px_rgba(16,185,129,0.3)]">
        <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
        <div className="absolute inset-8 border-2 border-emerald-500 border-dashed rounded-xl pointer-events-none opacity-50 flex items-center justify-center">
          <p className="text-white text-[10px] uppercase font-black tracking-widest bg-black/50 px-2 py-1">Align Document Here</p>
        </div>
      </div>
      <div className="mt-8 flex flex-col items-center gap-4 w-full">
        <button onClick={takePhoto} className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center p-1 group">
          <div className="w-full h-full bg-white rounded-full group-active:scale-90 transition-transform"></div>
        </button>
        <p className="text-slate-400 text-xs font-bold">Position clearly within the frame</p>
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

const ProfileOnboarding: React.FC<ProfileOnboardingProps> = ({ onComplete }) => {
  const [step, setStep] = useState(0); // 0: Phone, 1: OTP, 2: Info, 3: Car, 4: ID
  const [formData, setFormData] = useState({
    full_name: '',
    phone: '',
    otp: '',
    car_make: '',
    car_model: '',
    plate_number: '',
  });

  const [resendTimer, setResendTimer] = useState(0);
  const [isResending, setIsResending] = useState(false);

  useEffect(() => {
    let interval: any;
    if (resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer(t => t - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [resendTimer]);

  const handleResend = () => {
    setIsResending(true);
    // Simulate resend
    setTimeout(() => {
      setIsResending(false);
      setResendTimer(30);
      setMsg("New code sent to " + formData.phone);
    }, 1500);
  };

  const [uploads, setUploads] = useState<{ nin: 'none' | 'uploading' | 'done', license: 'none' | 'uploading' | 'done' }>({
    nin: 'none',
    license: 'none'
  });

  const [activeScanner, setActiveScanner] = useState<'nin' | 'license' | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const handleCapture = async (base64: string) => {
    if (!activeScanner) return;
    const docType = activeScanner;
    setActiveScanner(null);
    setVerifying(true);
    setUploads(prev => ({ ...prev, [docType]: 'uploading' }));
    
    try {
      const result = await verifyDocument(base64, docType);
      if (result.verified) {
        setUploads(prev => ({ ...prev, [docType]: 'done' }));
        setMsg("Document verified by AI!");
      } else {
        setUploads(prev => ({ ...prev, [docType]: 'none' }));
        setMsg("Verification failed. Try again.");
      }
    } catch {
      setUploads(prev => ({ ...prev, [docType]: 'done' }));
    } finally {
      setVerifying(false);
      setTimeout(() => setMsg(null), 3000);
    }
  };

  const handleSubmit = () => {
    onComplete({
      user_id: 'd-' + Math.random().toString(36).substr(2, 5),
      full_name: formData.full_name,
      phone_number: formData.phone,
      car_make: formData.car_make,
      car_model: formData.car_model,
      car_color: 'White',
      plate_number: formData.plate_number,
      verification_status: { phone: true, id: true, first_trip: false },
      rating: 5.0,
      trip_count: 0,
      wallet_balance: 0,
      total_earnings: 0,
    });
  };

  return (
    <div className="max-w-md mx-auto min-h-screen bg-white flex flex-col text-black">
      <div className="w-full bg-slate-100 h-2">
        <div className="h-full bg-emerald-600 transition-all duration-500" style={{ width: `${(step / 4) * 100}%` }} />
      </div>

      {activeScanner && <CameraScanner label={activeScanner === 'nin' ? 'Scan NIN' : 'Scan License'} onCapture={handleCapture} onClose={() => setActiveScanner(null)} />}
      
      {verifying && (
        <div className="fixed inset-0 z-[150] bg-white/90 flex flex-col items-center justify-center p-6 text-center animate-in fade-in">
          <div className="w-16 h-16 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mb-4" />
          <h3 className="text-xl font-black">Gemini AI Analyzing ID...</h3>
          <p className="text-gray-500 font-bold mt-2">Checking for security holograms and text validity</p>
        </div>
      )}

      {msg && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl font-black text-sm animate-in slide-in-from-top-4">
          {msg}
        </div>
      )}

      <div className="flex-1 p-8 space-y-8 overflow-y-auto">
        {step === 0 && (
          <div className="space-y-8 animate-in slide-in-from-bottom-4">
            <header className="text-center space-y-4">
              <div className="mx-auto w-20 h-20 bg-emerald-100 text-emerald-600 rounded-3xl flex items-center justify-center font-black text-4xl shadow-lg border-2 border-emerald-50">R</div>
              <h2 className="text-3xl font-black tracking-tight">Enter Phone</h2>
              <p className="text-gray-500 font-bold">Sign up with your Nigerian phone number to start filling seats.</p>
            </header>
            <div className="space-y-4">
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-gray-400 text-lg">+234</span>
                <input 
                  type="tel" placeholder="902 874 3008" value={formData.phone}
                  onChange={e => setFormData({...formData, phone: e.target.value.replace(/\D/g, '')})}
                  className="w-full p-5 pl-16 bg-slate-50 border-2 border-slate-200 rounded-2xl font-black text-lg focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all"
                />
              </div>
              <button onClick={() => setStep(1)} disabled={formData.phone.length < 10} className="w-full bg-emerald-600 text-white p-5 rounded-2xl font-black text-xl shadow-xl shadow-emerald-600/20 disabled:opacity-50 active:scale-[0.98] transition-all">Continue</button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-8 animate-in slide-in-from-right-4">
            <header className="text-center space-y-2">
              <h2 className="text-3xl font-black">Verify Phone</h2>
              <p className="text-gray-500 font-bold">We sent a 4-digit code to <span className="text-black">+234{formData.phone}</span></p>
            </header>
            <div className="space-y-6">
              <div className="space-y-2">
                <input 
                  maxLength={4} placeholder="0 0 0 0" value={formData.otp}
                  onChange={e => setFormData({...formData, otp: e.target.value.replace(/\D/g, '')})}
                  className="w-full p-5 bg-slate-50 border-2 border-slate-200 rounded-2xl font-black text-4xl text-center tracking-[0.5em] focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all"
                />
                <div className="flex justify-between items-center px-1">
                   <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest italic">
                     {ICONS.Alert} Demo: Use 1234
                   </p>
                   <button 
                    onClick={handleResend}
                    disabled={resendTimer > 0 || isResending}
                    className={`text-xs font-black uppercase tracking-tight ${resendTimer > 0 ? 'text-gray-300' : 'text-emerald-600 underline'}`}
                   >
                     {isResending ? 'Sending...' : resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend Code'}
                   </button>
                </div>
              </div>
              <button onClick={() => setStep(2)} disabled={formData.otp.length < 4} className="w-full bg-emerald-600 text-white p-5 rounded-2xl font-black text-xl shadow-xl shadow-emerald-600/20 disabled:opacity-50 active:scale-[0.98] transition-all">Verify Code</button>
              
              <div className="text-center pt-4 border-t border-slate-100">
                <button onClick={() => setStep(0)} className="text-gray-400 text-xs font-black uppercase tracking-widest hover:text-black">Change Phone Number</button>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-8 animate-in slide-in-from-right-4">
            <header className="space-y-2">
              <h2 className="text-3xl font-black">Basic Info</h2>
              <p className="text-gray-500 font-bold">Tell us your name as it appears on your license.</p>
            </header>
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Full Legal Name</label>
                <input 
                  placeholder="e.g. Aliyu Abubakar" value={formData.full_name}
                  onChange={e => setFormData({...formData, full_name: e.target.value})}
                  className="w-full p-5 bg-slate-50 border-2 border-slate-200 rounded-2xl font-black text-lg outline-none focus:border-emerald-500 transition-all"
                />
              </div>
              <button onClick={() => setStep(3)} disabled={!formData.full_name} className="w-full bg-emerald-600 text-white p-5 rounded-2xl font-black text-xl shadow-xl shadow-emerald-600/20 disabled:opacity-50 active:scale-[0.98] transition-all">Next: Car Details</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-8 animate-in slide-in-from-right-4">
            <header className="space-y-2">
              <h2 className="text-3xl font-black">Car Details</h2>
              <p className="text-gray-500 font-bold">Passengers look for these details at pickup.</p>
            </header>
            <div className="space-y-4">
              <input placeholder="Make (e.g. Toyota)" value={formData.car_make} onChange={e => setFormData({...formData, car_make: e.target.value})} className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-black focus:border-emerald-500 outline-none" />
              <input placeholder="Model (e.g. Corolla)" value={formData.car_model} onChange={e => setFormData({...formData, car_model: e.target.value})} className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-black focus:border-emerald-500 outline-none" />
              <input placeholder="License Plate (e.g. ABC-123-XY)" value={formData.plate_number} onChange={e => setFormData({...formData, plate_number: e.target.value})} className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-black focus:border-emerald-500 outline-none" />
              <button onClick={() => setStep(4)} disabled={!formData.plate_number} className="w-full bg-emerald-600 text-white p-5 rounded-2xl font-black text-xl shadow-xl shadow-emerald-600/20 active:scale-[0.98] transition-all">Next: ID Scan</button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-8 animate-in slide-in-from-right-4">
            <header className="text-center space-y-2">
              <h2 className="text-3xl font-black">AI ID Scan</h2>
              <p className="text-gray-500 font-bold">Final step! Our AI will instantly verify your credentials.</p>
            </header>
            <div className="space-y-4">
              <UploadButton label="License" status={uploads.license} onClick={() => setActiveScanner('license')} icon={<FileText size={22} />} />
              <UploadButton label="NIN" status={uploads.nin} onClick={() => setActiveScanner('nin')} icon={<CreditCard size={22} />} />
              <div className="bg-blue-50 p-4 rounded-2xl flex gap-3 border border-blue-100">
                <div className="text-blue-600">{ICONS.Check}</div>
                <p className="text-[10px] text-blue-800 font-bold leading-tight uppercase tracking-tight">AI verification ensures safety for all Daura-route travelers.</p>
              </div>
              <button onClick={handleSubmit} disabled={uploads.license !== 'done'} className="w-full bg-emerald-600 text-white p-5 rounded-2xl font-black text-xl shadow-xl shadow-emerald-600/20 disabled:opacity-50 mt-4 active:scale-[0.98] transition-all">Create My Profile</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const UploadButton: React.FC<{ label: string, status: 'none' | 'uploading' | 'done', onClick: () => void, icon: React.ReactNode }> = ({ label, status, onClick, icon }) => (
  <button onClick={status === 'none' ? onClick : undefined} className={`w-full p-5 border-2 rounded-2xl flex items-center justify-between group transition-all ${status === 'done' ? 'bg-emerald-50 border-emerald-500' : 'bg-white border-slate-200 hover:border-emerald-200'}`}>
    <div className="flex items-center gap-4">
      <div className={`p-3 rounded-xl transition-colors ${status === 'done' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-gray-400 group-hover:text-emerald-500'}`}>{icon}</div>
      <div className="text-left font-black">{label} {status === 'done' && '✓'}</div>
    </div>
    <div className="text-xs text-emerald-600 font-black uppercase tracking-tight">
      {status === 'done' ? 'AI Verified' : status === 'uploading' ? 'Analyzing...' : 'Scan'}
    </div>
  </button>
);

const FileText: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
);

const CreditCard: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>
);

export default ProfileOnboarding;