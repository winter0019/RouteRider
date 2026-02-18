
import React, { useState } from 'react';
import { DriverProfile } from '../types';
import { ICONS, COLORS } from '../constants';

interface SettingsProps {
  profile: DriverProfile;
  onLogout: () => void;
  onUpdate?: (p: DriverProfile) => void;
  userRole: 'driver' | 'passenger';
}

const SettingsView: React.FC<SettingsProps> = ({ profile, onLogout, onUpdate, userRole }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    full_name: profile.full_name,
    car_make: profile.car_make,
    car_model: profile.car_model,
    plate_number: profile.plate_number
  });

  const handleSave = () => {
    if (onUpdate) {
      onUpdate({ ...profile, ...editData });
    }
    setIsEditing(false);
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
        <div className="bg-white border-2 border-slate-100 p-6 rounded-3xl space-y-4 shadow-sm animate-in slide-in-from-top-2">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase">Full Name</label>
            <input value={editData.full_name} onChange={e => setEditData({...editData, full_name: e.target.value})} className="w-full p-3 bg-slate-50 rounded-xl font-black border-2 border-transparent focus:border-emerald-500 outline-none" />
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
              </>
            )}
            <div className="p-4 flex justify-between">
              <span className="text-gray-500 font-bold text-sm">ID Status</span>
              <span className="text-emerald-600 font-black text-sm uppercase">Active</span>
            </div>
          </div>
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
