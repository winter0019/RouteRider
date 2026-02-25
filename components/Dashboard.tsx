
import React, { useState, useEffect } from 'react';
import { DriverProfile, Trip, Booking, TripStatus, BookingStatus } from '../types';
import { ICONS, COLORS, ROUTES } from '../constants';
import { getDriverInsights } from '../services/geminiService';

interface DashboardProps {
  profile: DriverProfile;
  activeTrip: Trip | null;
  bookings: Booking[];
  onNavigate: (page: any) => void;
  onCompleteTrip: (tripId: string) => Promise<void>;
}

const Dashboard: React.FC<DashboardProps> = ({ profile, activeTrip, bookings, onNavigate, onCompleteTrip }) => {
  const [insight, setInsight] = useState<string>("Calculating your daily impact...");

  useEffect(() => {
    const fetchInsight = async () => {
      const text = await getDriverInsights(profile.total_earnings);
      setInsight(text || "Keep up the great work on the Daura route!");
    };
    fetchInsight();
  }, [profile.total_earnings]);

  const fuelOffsetPercent = Math.min(100, Math.round((profile.total_earnings / 80000) * 100));

  // Derive seat counts from bookings for real-time accuracy
  const acceptedCount = bookings.filter(b => b.status === BookingStatus.ACCEPTED).length;
  const pendingCount = bookings.filter(b => b.status === BookingStatus.PENDING).length;
  const totalBooked = acceptedCount + pendingCount; // Reserved seats
  const seatsAvailable = activeTrip?.seats_available || 0;

  return (
    <div className="space-y-6 text-black">
      {/* Welcome Card */}
      <section>
        <h2 className="text-2xl font-black text-black">Sannu, {profile.full_name.split(' ')[0]}!</h2>
        <p className="text-gray-600 text-sm font-bold">Ready for your Daura trip today?</p>
      </section>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-2xl border-2 border-slate-100 shadow-sm space-y-1">
          <p className="text-[10px] text-gray-500 uppercase font-black tracking-wider">Today's Earnings</p>
          <div className="text-xl font-black text-emerald-600">₦{profile.total_earnings.toLocaleString()}</div>
        </div>
        <div className="bg-white p-4 rounded-2xl border-2 border-slate-100 shadow-sm space-y-1">
          <p className="text-[10px] text-gray-500 uppercase font-black tracking-wider">Wallet Balance</p>
          <div className="text-xl font-black text-black">₦{profile.wallet_balance.toLocaleString()}</div>
        </div>
      </div>

      {/* Fuel Offset Progress */}
      <div className="bg-emerald-50 p-5 rounded-3xl border-2 border-emerald-100">
        <div className="flex justify-between items-end mb-2">
          <div>
            <h3 className="font-black text-emerald-900 text-sm uppercase tracking-tight">Fuel Offset</h3>
            <p className="text-[10px] text-emerald-700 font-bold">Monthly goal: ₦80,000</p>
          </div>
          <span className="text-lg font-black text-emerald-700">{fuelOffsetPercent}%</span>
        </div>
        <div className="w-full bg-emerald-200 h-3 rounded-full overflow-hidden">
          <div 
            className="bg-emerald-600 h-full transition-all duration-1000 ease-out" 
            style={{ width: `${fuelOffsetPercent}%` }}
          />
        </div>
        <p className="mt-4 text-xs text-emerald-800 font-bold italic leading-relaxed">
          "{insight}"
        </p>
      </div>

      {/* Active Trip Status */}
      <section className="space-y-3">
        <h3 className="font-black text-black flex items-center gap-2 text-sm uppercase tracking-widest">
          {ICONS.Car} Active Trip
        </h3>
        {activeTrip ? (
          <div className="bg-white border-2 border-slate-100 p-5 rounded-3xl shadow-md space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-black text-xl text-black">{activeTrip.route}</div>
                <div className="text-sm text-gray-600 flex items-center gap-1 font-bold">
                  {ICONS.Clock} {new Date(activeTrip.departure_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tight ${
                activeTrip.status === TripStatus.POSTED ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-orange-100 text-orange-700 border border-orange-200'
              }`}>
                {activeTrip.status.replace('_', ' ')}
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                {[...Array(acceptedCount)].map((_, i) => (
                  <div key={`acc-${i}`} className="w-8 h-8 rounded-full border-2 border-white bg-emerald-500 flex items-center justify-center text-white shadow-sm">
                    {ICONS.User}
                  </div>
                ))}
                {[...Array(pendingCount)].map((_, i) => (
                  <div key={`pen-${i}`} className="w-8 h-8 rounded-full border-2 border-white bg-amber-100 flex items-center justify-center text-amber-600 animate-pulse">
                    {ICONS.User}
                  </div>
                ))}
                {[...Array(Math.max(0, seatsAvailable - totalBooked))].map((_, i) => (
                  <div key={`empty-${i}`} className="w-8 h-8 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center text-slate-300">
                    {ICONS.User}
                  </div>
                ))}
              </div>
              <div className="flex flex-col">
                <p className="text-sm font-black text-gray-700">
                  {acceptedCount}/{seatsAvailable} seats confirmed
                </p>
                {pendingCount > 0 && (
                  <p className="text-[10px] text-amber-600 font-bold uppercase tracking-tight">
                    {pendingCount} pending request{pendingCount > 1 ? 's' : ''}
                  </p>
                )}
              </div>
            </div>

            {activeTrip.status !== TripStatus.COMPLETED && (
              <button
                onClick={() => {
                  if (confirm("Are you sure you want to complete this trip? This will release all escrowed payments to your wallet.")) {
                    onCompleteTrip(activeTrip.trip_id);
                  }
                }}
                className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black text-sm shadow-lg shadow-emerald-100 active:scale-95 transition-all"
              >
                Complete Trip & Release Funds
              </button>
            )}
          </div>
        ) : (
          <div className="bg-slate-50 border-2 border-dashed border-slate-200 p-8 rounded-3xl flex flex-col items-center justify-center text-center space-y-4">
            <div className="p-4 bg-slate-100 rounded-2xl text-slate-400">
              {ICONS.Post}
            </div>
            <p className="text-sm text-gray-600 font-black">No active trips posted.</p>
            <button 
              onClick={() => onNavigate('post-trip')}
              className={`${COLORS.primary} text-white px-8 py-3 rounded-2xl text-sm font-black shadow-xl shadow-emerald-200 hover:scale-[1.05] active:scale-95 transition-all`}
            >
              Post New Trip
            </button>
          </div>
        )}
      </section>

      {/* Quick Actions */}
      <section className="space-y-3">
        <h3 className="font-black text-black text-sm uppercase tracking-widest">Quick Actions</h3>
        <div className="grid grid-cols-2 gap-3">
          <button 
            onClick={() => onNavigate('wallet')}
            className="flex items-center gap-3 p-4 bg-white border-2 border-slate-100 rounded-2xl hover:bg-slate-50 transition-all text-left group"
          >
            <div className="p-2 bg-amber-100 text-amber-600 rounded-xl group-hover:scale-110 transition-transform">{ICONS.Wallet}</div>
            <span className="font-black text-sm text-gray-700">Withdraw</span>
          </button>
          <button 
            onClick={() => onNavigate('settings')}
            className="flex items-center gap-3 p-4 bg-white border-2 border-slate-100 rounded-2xl hover:bg-slate-50 transition-all text-left group"
          >
            <div className="p-2 bg-blue-100 text-blue-600 rounded-xl group-hover:scale-110 transition-transform">{ICONS.User}</div>
            <span className="font-black text-sm text-gray-700">ID Status</span>
          </button>
        </div>
      </section>
    </div>
  );
};

export default Dashboard;