
import React from 'react';
import { DriverProfile, Transaction } from '../types';
import { ICONS, COLORS } from '../constants';

interface WalletProps {
  profile: DriverProfile;
  transactions: Transaction[];
  userRole: 'driver' | 'passenger';
}

const WalletView: React.FC<WalletProps> = ({ profile, transactions, userRole }) => {
  const isDriver = userRole === 'driver';

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-bold">My Wallet</h2>
        <p className="text-gray-500 text-sm">
          {isDriver ? 'Manage your earnings and withdrawals' : 'Manage your trip payments and refunds'}
        </p>
      </header>

      {/* Balance Card */}
      <div className={`${COLORS.primary} p-6 rounded-3xl text-white shadow-xl shadow-emerald-100 space-y-4`}>
        <div className="space-y-1">
          <p className="text-emerald-100 text-xs font-bold uppercase tracking-widest">
            {isDriver ? 'Available Balance' : 'Wallet Balance'}
          </p>
          <div className="text-4xl font-bold">₦{profile.wallet_balance.toLocaleString()}</div>
        </div>
        <div className="flex gap-2">
          {isDriver ? (
            <>
              <button className="flex-1 bg-white/20 backdrop-blur-md py-3 rounded-2xl font-bold text-sm hover:bg-white/30 transition-colors">
                Withdraw
              </button>
              <button className="flex-1 bg-white text-emerald-600 py-3 rounded-2xl font-bold text-sm shadow-sm">
                Withdraw All
              </button>
            </>
          ) : (
            <button className="flex-1 bg-white text-emerald-600 py-3 rounded-2xl font-bold text-sm shadow-sm">
              Top Up Wallet
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border p-4 rounded-2xl">
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">
            {isDriver ? 'Life-time Earnings' : 'Life-time Spent'}
          </p>
          <div className="text-lg font-bold text-gray-900">₦{profile.total_earnings.toLocaleString()}</div>
        </div>
        <div className="bg-white border p-4 rounded-2xl">
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">Trips Done</p>
          <div className="text-lg font-bold text-gray-900">{profile.trip_count}</div>
        </div>
      </div>

      {/* Transactions */}
      <section className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-sm text-gray-400 uppercase tracking-widest">Recent Activity</h3>
          <button className="text-emerald-600 text-xs font-bold">See All</button>
        </div>

        <div className="space-y-2">
          {transactions.length > 0 ? (
            transactions.map(tx => (
              <div key={tx.transaction_id} className="bg-white border p-4 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${tx.type === 'deposit' ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-600'}`}>
                    {tx.type === 'deposit' ? ICONS.Check : ICONS.Clock}
                  </div>
                  <div>
                    <div className="font-bold text-sm">{tx.description}</div>
                    <div className="text-[10px] text-gray-400">{new Date(tx.created_at).toLocaleDateString()}</div>
                  </div>
                </div>
                <div className={`font-bold ${tx.type === 'deposit' ? 'text-emerald-600' : 'text-gray-900'}`}>
                  {tx.type === 'deposit' ? '+' : '-'}₦{tx.amount.toLocaleString()}
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-12 space-y-2">
              <div className="mx-auto w-12 h-12 bg-gray-50 text-gray-200 rounded-full flex items-center justify-center">
                {ICONS.Wallet}
              </div>
              <p className="text-sm text-gray-400">No transactions yet.</p>
            </div>
          )}
        </div>
      </section>

      {/* Info Box */}
      <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex gap-3">
        <div className="text-amber-600">{ICONS.Alert}</div>
        <p className="text-xs text-amber-800 leading-relaxed font-medium">
          {isDriver 
            ? 'Payments are held in escrow until trip completion. Withdrawals to bank accounts typically take 1-2 hours.' 
            : 'Payments are secure and only released when the driver confirms your pickup. Refunds are instant to your wallet.'}
        </p>
      </div>
    </div>
  );
};

export default WalletView;
