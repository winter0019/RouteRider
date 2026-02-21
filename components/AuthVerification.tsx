
import React, { useState, useRef, useEffect } from 'react';
import { auth, isFirebaseConfigured } from '../services/firebase';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  signInAnonymously,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult
} from 'firebase/auth';
import { ICONS } from '../constants';

interface AuthVerificationProps {
  onVerified: (identifier: string) => void;
  onBack?: () => void;
}

const AuthVerification: React.FC<AuthVerificationProps> = ({ onVerified, onBack }) => {
  const [authMethod, setAuthMethod] = useState<'email' | 'phone'>('email');
  const [mode, setMode] = useState<'signup' | 'login'>('signup');
  
  // Email States
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // Phone States
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [phoneStep, setPhoneStep] = useState<'phone' | 'otp'>('phone');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  
  const recaptchaVerifier = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    return () => {
      if (recaptchaVerifier.current) {
        recaptchaVerifier.current.clear();
      }
    };
  }, []);

  const setupRecaptcha = () => {
    if (!recaptchaVerifier.current && auth) {
      recaptchaVerifier.current = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible',
        callback: () => {}
      });
    }
  };

  const handleEmailAuth = async () => {
    if (!isFirebaseConfigured() || !auth) {
      setError('Firebase is not configured.');
      return;
    }
    
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }

    try {
      setError(null);
      setIsVerifying(true);
      
      if (mode === 'signup') {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      
      onVerified(email);
    } catch (err: any) {
      console.error('Firebase Auth Error:', err);
      if (err.code === 'auth/email-already-in-use') setError('Email already registered.');
      else if (err.code === 'auth/invalid-email') setError('Invalid email address.');
      else if (err.code === 'auth/weak-password') setError('Password too weak.');
      else setError('Authentication failed.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSendOTP = async () => {
    if (!isFirebaseConfigured() || !auth) {
      setError('Firebase is not configured.');
      return;
    }
    
    if (!phoneNumber) {
      setError('Please enter a phone number.');
      return;
    }

    try {
      setError(null);
      setDemoMode(false);
      setIsVerifying(true);
      setupRecaptcha();
      
      const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+234${phoneNumber}`;
      const confirmation = await signInWithPhoneNumber(auth, formattedPhone, recaptchaVerifier.current!);
      setConfirmationResult(confirmation);
      setPhoneStep('otp');
    } catch (err: any) {
      console.error('Phone Auth Error:', err);
      if (err.code === 'auth/billing-not-enabled') {
        setDemoMode(true);
        setPhoneStep('otp');
      } else {
        setError(err.message || 'Failed to send OTP.');
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!otp || otp.length !== 6) {
      setError('Enter 6-digit code.');
      return;
    }

    try {
      setError(null);
      setIsVerifying(true);
      if (confirmationResult) {
        await confirmationResult.confirm(otp);
        onVerified(phoneNumber);
      } else {
        // Demo Bypass: Sign in anonymously to satisfy Firestore rules
        if (auth) await signInAnonymously(auth);
        onVerified(phoneNumber);
      }
    } catch (err: any) {
      setError('Invalid OTP.');
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

      {demoMode && (
        <div className="p-4 bg-amber-50 border-2 border-amber-100 rounded-2xl text-amber-700 text-sm font-bold flex flex-col gap-1">
          <div className="flex items-center gap-2">
            {ICONS.Info}
            <span>Demo Mode Active</span>
          </div>
          <p className="text-[10px] opacity-80">SMS billing is not enabled on this Firebase project. You can enter any 6-digit code to continue testing.</p>
        </div>
      )}

      <div className="space-y-6">
        <div className="flex bg-slate-100 p-1 rounded-2xl">
          <button 
            onClick={() => { setAuthMethod('email'); setError(null); }}
            className={`flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all ${authMethod === 'email' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400'}`}
          >
            Email
          </button>
          <button 
            onClick={() => { setAuthMethod('phone'); setError(null); }}
            className={`flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all ${authMethod === 'phone' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400'}`}
          >
            Phone
          </button>
        </div>

        {authMethod === 'email' ? (
          <div className="space-y-6">
            <header className="text-center space-y-2">
              <h2 className="text-3xl font-black">{mode === 'signup' ? 'Create Account' : 'Welcome Back'}</h2>
              <p className="text-gray-500 font-bold">Sign in with your email address.</p>
            </header>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-black uppercase text-gray-400 ml-2">Email</label>
                <input 
                  type="email" 
                  placeholder="name@example.com" 
                  value={email}
                  onChange={e => setEmail(e.target.value)} 
                  className="w-full p-5 bg-slate-50 border-2 border-slate-200 rounded-2xl font-black text-lg outline-none focus:border-emerald-500 transition-all" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black uppercase text-gray-400 ml-2">Password</label>
                <input 
                  type="password" 
                  placeholder="••••••••" 
                  value={password}
                  onChange={e => setPassword(e.target.value)} 
                  className="w-full p-5 bg-slate-50 border-2 border-slate-200 rounded-2xl font-black text-lg outline-none focus:border-emerald-500 transition-all" 
                />
              </div>
              <button 
                onClick={handleEmailAuth} 
                disabled={isVerifying}
                className="w-full bg-emerald-600 text-white p-5 rounded-2xl font-black text-xl shadow-xl shadow-emerald-200 flex items-center justify-center gap-2"
              >
                {isVerifying && <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                {mode === 'signup' ? 'Sign Up' : 'Log In'}
              </button>
              <button 
                onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')} 
                className="w-full text-emerald-600 font-black text-sm uppercase tracking-wider"
              >
                {mode === 'signup' ? 'Switch to Log In' : 'Switch to Sign Up'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {phoneStep === 'phone' ? (
              <div className="space-y-6">
                <header className="text-center space-y-2">
                  <h2 className="text-3xl font-black">Phone Login</h2>
                  <p className="text-gray-500 font-bold">Enter your Nigerian phone number.</p>
                </header>
                <div className="space-y-4">
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-gray-400">+234</span>
                    <input 
                      type="tel" 
                      placeholder="902 874 3008" 
                      value={phoneNumber}
                      onChange={e => setPhoneNumber(e.target.value)} 
                      className="w-full p-5 pl-16 bg-slate-50 border-2 border-slate-200 rounded-2xl font-black text-lg outline-none focus:border-emerald-500 transition-all" 
                    />
                  </div>
                  <button 
                    onClick={handleSendOTP} 
                    disabled={isVerifying}
                    className="w-full bg-emerald-600 text-white p-5 rounded-2xl font-black text-xl shadow-xl shadow-emerald-200 flex items-center justify-center gap-2"
                  >
                    {isVerifying && <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                    Send OTP
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <header className="text-center space-y-2">
                  <h2 className="text-3xl font-black">Verify OTP</h2>
                  <p className="text-gray-500 font-bold">Enter the 6-digit code.</p>
                </header>
                <div className="space-y-4">
                  <input 
                    type="text" 
                    maxLength={6}
                    placeholder="123456" 
                    value={otp}
                    onChange={e => setOtp(e.target.value)} 
                    className="w-full p-5 bg-slate-50 border-2 border-slate-200 rounded-2xl font-black text-center text-3xl tracking-[0.5em] outline-none focus:border-emerald-500 transition-all" 
                  />
                  <button 
                    onClick={handleVerifyOTP} 
                    disabled={isVerifying}
                    className="w-full bg-emerald-600 text-white p-5 rounded-2xl font-black text-xl shadow-xl shadow-emerald-200 flex items-center justify-center gap-2"
                  >
                    {isVerifying && <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                    Verify & Continue
                  </button>
                  <button 
                    onClick={() => setPhoneStep('phone')} 
                    className="w-full text-emerald-600 font-black text-sm uppercase tracking-wider"
                  >
                    Change Number
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

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
  );
};

export default AuthVerification;
