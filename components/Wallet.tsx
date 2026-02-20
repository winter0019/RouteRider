
import React from 'react';
import { DriverProfile, Transaction, Booking, BookingStatus } from '../types';
import { ICONS, COLORS, ROUTES } from '../constants';

interface WalletProps {
  profile: DriverProfile;
  transactions: Transaction[];
  userRole: 'driver' | 'passenger';
  bookings?: Booking[];
}

const WalletView: React.FC<WalletProps> = ({ profile, transactions, userRole, bookings = [] }) => {
  const isDriver = userRole === 'driver';
  
  // For passengers, "transactions" might be empty in demo, so we show their "My Rides"
  const myRides = bookings.filter(b => b.passenger_id === profile.user_id || b.passenger_name === profile.full_name);

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-black">
          {isDriver ? 'My Wallet' : 'My Trips & Wallet'}
        </h2>
        <p className="text-gray-500 text-sm font-bold">
          {isDriver ? 'Manage your earnings and withdrawals' : 'Track your rides and payments'}
        </p>
      </header>

      {/* Balance Card */}
      <div className={`${COLORS.primary} p-6 rounded-[2.5rem] text-white shadow-xl shadow-emerald-100 space-y-4 relative overflow-hidden`}>
        <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>
        <div className="space-y-1">
          <p className="text-emerald-100 text-[10px] font-black uppercase tracking-widest">
            {isDriver ? 'Available for Withdrawal' : 'Escrow Balance'}
          </p>
          <div className="text-4xl font-black">₦{profile.wallet_balance.toLocaleString()}</div>
        </div>
        <div className="flex gap-2">
          {isDriver ? (
            <>
              <button className="flex-1 bg-white/20 backdrop-blur-md py-4 rounded-2xl font-black text-sm hover:bg-white/30 transition-colors">
                Withdraw
              </button>
              <button className="flex-1 bg-white text-emerald-600 py-4 rounded-2xl font-black text-sm shadow-sm active:scale-95 transition-all">
                Quick Payout
              </button>
            </>
          ) : (
            <button className="flex-1 bg-white text-emerald-600 py-4 rounded-2xl font-black text-sm shadow-sm active:scale-95 transition-all">
              Add Funds
            </button>
          )}
        </div>
      </div>

      {/* Passenger Specific: My Rides */}
      {!isDriver && (
        <section className="space-y-4 pt-2">
          <div className="flex justify-between items-center px-1">
            <h3 className="font-black text-xs text-gray-400 uppercase tracking-widest">Active Rides</h3>
            <span className="text-[10px] bg-slate-100 text-slate-500 font-black px-2 py-0.5 rounded-full">
              {myRides.length} Total
            </span>
          </div>
          
          <div className="space-y-3">
            {myRides.length > 0 ? (
              myRides.map(ride => (
                <div key={ride.booking_id} className="bg-white border-2 border-slate-100 p-4 rounded-3xl flex items-center justify-between shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                      {ICONS.Car}
                    </div>
                    <div>
                      <div className="font-black text-sm">Trip to Katsina</div>
                      <div className="text-[10px] text-gray-400 font-bold">{new Date(ride.created_at).toLocaleDateString()}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-black text-sm">₦{ride.amount_paid}</div>
                    <div className={`text-[10px] font-black uppercase ${
                      ride.status === BookingStatus.ACCEPTED ? 'text-emerald-600' : 'text-amber-500'
                    }`}>
                      {ride.status}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl">
                <p className="text-sm font-black text-slate-400">No active bookings found</p>
                <p className="text-[10px] text-slate-300 font-bold uppercase mt-1">Book your first seat today</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Transactions Section */}
      <section className="space-y-4">
        <div className="flex justify-between items-center px-1">
          <h3 className="font-black text-xs text-gray-400 uppercase tracking-widest">Recent Activity</h3>
          <button className="text-emerald-600 text-[10px] font-black uppercase tracking-widest">Full History</button>
        </div>

        <div className="space-y-2">
          {transactions.length > 0 ? (
            transactions.map(tx => (
              <div key={tx.transaction_id} className="bg-white border-2 border-slate-100 p-4 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${tx.type === 'deposit' ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-600'}`}>
                    {tx.type === 'deposit' ? ICONS.Check : ICONS.Clock}
                  </div>
                  <div>
                    <div className="font-black text-sm">{tx.description}</div>
                    <div className="text-[10px] text-gray-400 font-bold">{new Date(tx.created_at).toLocaleDateString()}</div>
                  </div>
                </div>
                <div className={`font-black ${tx.type === 'deposit' ? 'text-emerald-600' : 'text-gray-900'}`}>
                  {tx.type === 'deposit' ? '+' : '-'}₦{tx.amount.toLocaleString()}
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-12 space-y-2">
              <div className="mx-auto w-12 h-12 bg-gray-50 text-gray-200 rounded-full flex items-center justify-center">
                {ICONS.Wallet}
              </div>
              <p className="text-sm font-black text-gray-400">No transactions recorded yet.</p>
            </div>
          )}
        </div>
      </section>

      {/* Support Banner */}
      <div className="bg-amber-50 border-2 border-amber-100 p-5 rounded-3xl flex gap-3">
        <div className="text-amber-600 shrink-0">{ICONS.Alert}</div>
        <p className="text-[11px] text-amber-800 leading-relaxed font-bold">
          {isDriver 
            ? 'Withdrawals are processed instantly to your linked bank account. Minimum withdrawal is ₦5,000.' 
            : 'Escrow payments are automatically released to the car owner 2 hours after the scheduled departure unless you report an issue.'}
        </p>
      </div>
    </div>
  );
};

export default WalletView;
