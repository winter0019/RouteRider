
import React, { useState, useRef } from 'react';
import { DriverProfile } from '../types';
import { ICONS, COLORS } from '../constants';
import { api } from '../services/api';
import BankAccountSetup from './BankAccountSetup';

interface SettingsProps {
  profile: DriverProfile;
  onLogout: () => void;
  onUpdate?: (p: DriverProfile) => void;
  userRole: 'driver' | 'passenger';
}

const SettingsView: React.FC<SettingsProps> = ({ profile, onLogout, onUpdate, userRole }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showBankSetup, setShowBankSetup] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editData, setEditData] = useState({
    full_name: profile.full_name,
    car_make: profile.car_make,
    car_model: profile.car_model,
    plate_number: profile.plate_number,
    profile_photo_url: profile.profile_photo_url
  });

  const handleSave = () => {
    if (onUpdate) {
      onUpdate({ ...profile, ...editData });
    }
    setIsEditing(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      setEditData(prev => ({ ...prev, profile_photo_url: base64String }));
      setIsUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const isDriver = userRole === 'driver';

  return (
    <div className="space-y-6 text-black">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black">Settings</h2>
          <p className="text-gray-500 text-sm font-bold">Manage your profile</p>
        </div>
        {!isEditing ? (
          <button onClick={() => setIsEditing(true)} className="px-4 py-2 bg-slate-100 rounded-xl font-black text-xs">Edit</button>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => setIsEditing(false)} className="px-4 py-2 text-gray-500 font-black text-xs">Cancel</button>
            <button onClick={handleSave} className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-black text-xs">Save</button>
          </div>
        )}
      </header>

      {isEditing ? (
        <div className="bg-white border-2 border-slate-100 p-6 rounded-3xl space-y-6 shadow-sm animate-in slide-in-from-top-2">
          <div className="flex flex-col items-center gap-4">
            <div className="relative group">
              <div className="w-24 h-24 rounded-3xl bg-slate-100 overflow-hidden border-4 border-white shadow-md">
                <img 
                  src={editData.profile_photo_url || `https://picsum.photos/150/150?seed=${profile.user_id}`} 
                  alt="Profile" 
                  className="w-full h-full object-cover" 
                />
                {isUploading && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  </div>
                )}
              </div>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-2 -right-2 w-10 h-10 bg-emerald-600 text-white rounded-2xl flex items-center justify-center shadow-lg active:scale-90 transition-all"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*" 
                onChange={handleFileChange} 
              />
            </div>
            <p className="text-[10px] font-black text-gray-400 uppercase">Tap icon to change photo</p>
          </div>

          <div className="space-y-4">
            <div className="space-y-1">
              <div className="flex justify-between items-end">
                <label className="text-[10px] font-black text-gray-400 uppercase">Full Name</label>
                {profile.name_locked && (
                  <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${profile.name_correction_used ? 'bg-slate-100 text-slate-400' : 'bg-amber-100 text-amber-600'}`}>
                    {profile.name_correction_used ? 'Locked' : 'One-time Correction Available'}
                  </span>
                )}
              </div>
              <input 
                value={editData.full_name} 
                onChange={e => setEditData({...editData, full_name: e.target.value})} 
                disabled={profile.name_locked && profile.name_correction_used}
                className={`w-full p-3 bg-slate-50 rounded-xl font-black border-2 border-transparent focus:border-emerald-500 outline-none transition-all ${profile.name_locked && profile.name_correction_used ? 'opacity-50 cursor-not-allowed' : ''}`} 
              />
              {profile.name_locked && !profile.name_correction_used && (
                <p className="text-[9px] text-amber-600 font-bold px-1 italic">Note: This is your final allowed name correction.</p>
              )}
            </div>
            
            {isDriver && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase">Make</label>
                    <input value={editData.car_make} onChange={e => setEditData({...editData, car_make: e.target.value})} className="w-full p-3 bg-slate-50 rounded-xl font-black" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase">Model</label>
                    <input value={editData.car_model} onChange={e => setEditData({...editData, car_model: e.target.value})} className="w-full p-3 bg-slate-50 rounded-xl font-black" />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase">Plate Number</label>
                  <input value={editData.plate_number} onChange={e => setEditData({...editData, plate_number: e.target.value})} className="w-full p-3 bg-slate-50 rounded-xl font-black" />
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white border-2 border-slate-100 p-6 rounded-3xl flex items-center gap-4 shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 overflow-hidden border-2 border-emerald-50">
            <img src={profile.profile_photo_url || `https://picsum.photos/150/150?seed=${profile.user_id}`} alt="User" className="w-full h-full object-cover" />
          </div>
          <div>
            <h3 className="font-black text-lg">{profile.full_name}</h3>
            <p className="text-sm text-gray-500 font-bold">{profile.phone_number || 'No phone set'}</p>
            <div className="mt-1 inline-flex items-center px-2 py-0.5 rounded bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase border border-emerald-100">
              Verified {isDriver ? 'Driver' : 'Passenger'} ✓
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        <section className="space-y-2">
          <h3 className="px-1 text-[10px] font-black text-gray-400 uppercase tracking-widest">Account Details</h3>
          <div className="bg-white border-2 border-slate-100 rounded-3xl overflow-hidden shadow-sm">
            {isDriver && (
              <>
                <div className="p-4 border-b border-slate-100 flex justify-between">
                  <span className="text-gray-500 font-bold text-sm">Vehicle</span>
                  <span className="font-black text-sm">{profile.car_make} {profile.car_model}</span>
                </div>
                <div className="p-4 border-b border-slate-100 flex justify-between">
                  <span className="text-gray-500 font-bold text-sm">Plate</span>
                  <span className="font-black text-sm">{profile.plate_number}</span>
                </div>
                <button 
                  onClick={() => setShowBankSetup(true)}
                  className="w-full p-4 border-b border-slate-100 flex justify-between items-center hover:bg-slate-50 transition-colors"
                >
                  <div className="flex flex-col items-start">
                    <span className="text-gray-500 font-bold text-sm">Bank Payouts</span>
                    {profile.bank_name ? (
                      <span className="text-[10px] text-emerald-600 font-black uppercase">{profile.bank_name} • {profile.account_number}</span>
                    ) : (
                      <span className="text-[10px] text-amber-600 font-black uppercase italic">Not Linked</span>
                    )}
                  </div>
                  <div className="text-slate-300">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="9 18 15 12 9 6"/></svg>
                  </div>
                </button>
              </>
            )}
            <div className="p-4 flex justify-between">
              <span className="text-gray-500 font-bold text-sm">ID Status</span>
              <span className="text-emerald-600 font-black text-sm uppercase">Active</span>
            </div>
          </div>
        </section>

        {showBankSetup && (
          <BankAccountSetup 
            onSuccess={() => {
              setShowBankSetup(false);
              // Refresh profile if needed, but onUpdate usually handles parent state
              if (onUpdate) {
                api.getMe().then(res => {
                  if (res.profile) onUpdate(res.profile);
                });
              }
            }}
            onCancel={() => setShowBankSetup(false)}
          />
        )}

        <section className="space-y-2">
          <h3 className="px-1 text-[10px] font-black text-gray-400 uppercase tracking-widest">Debug Tools</h3>
          <button 
            onClick={async () => {
              try {
                const res = await api.getMe();
                alert(`Backend Connection Success!\nUID: ${res.uid}\nUser: ${res.user?.email || 'Anonymous'}`);
              } catch (err: any) {
                alert(`Backend Connection Failed:\n${err.message}`);
              }
            }}
            className="w-full p-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs flex items-center justify-center gap-2 hover:bg-slate-200 active:scale-95 transition-all"
          >
            Test Backend Connection
          </button>
        </section>

        <button onClick={onLogout} className="w-full p-5 bg-red-50 text-red-600 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-red-100 active:scale-95 transition-all">
          {ICONS.Logout} Log Out
        </button>
      </div>

      <div className="text-center space-y-1 py-4">
        <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">RouteRider v1.0.0 FOUNDATION</p>
      </div>
    </div>
  );
};

export default SettingsView;
