
import React, { useState, useEffect } from 'react';
import { DriverProfile, Transaction, Booking, BookingStatus } from '../types';
import { ICONS, COLORS, ROUTES } from '../constants';
import { api } from '../services/api';
import BankAccountSetup from './BankAccountSetup';

interface WalletProps {
  profile: DriverProfile;
  transactions: Transaction[];
  userRole: 'driver' | 'passenger';
  bookings?: Booking[];
  onTransaction?: (tx: { type: 'deposit' | 'withdrawal'; amount: number; description: string }) => Promise<void>;
  onRefreshProfile?: () => Promise<void>;
}

const WalletView: React.FC<WalletProps> = ({ profile, transactions, userRole, bookings = [], onTransaction, onRefreshProfile }) => {
  const isDriver = userRole === 'driver';
  const [showModal, setShowModal] = useState<'deposit' | 'withdraw' | 'link-bank' | null>(null);
  const [amount, setAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const bankDetails = (profile as any).bank_details;
  const isBankLinked = !!bankDetails?.recipient_code;

  // Check for Paystack reference on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get('reference');
    if (reference) {
      // With webhooks, we just need to refresh the wallet balance
      // The backend handles the verification
      const refresh = async () => {
        setIsProcessing(true);
        try {
          // Clean URL
          window.history.replaceState({}, document.title, window.location.pathname);
          // Trigger refresh via parent
          if (onTransaction) await onTransaction({ type: 'deposit', amount: 0, description: 'Refresh' });
          alert("Payment processed! Your balance will update shortly.");
        } catch (err) {
          console.error("Refresh failed", err);
        } finally {
          setIsProcessing(false);
        }
      };
      refresh();
    }
  }, []);
  
  // For passengers, "transactions" might be empty in demo, so we show their "My Rides"
  const myRides = bookings.filter(b => b.passenger_id === profile.user_id || b.passenger_name === profile.full_name);

  const handleAction = async () => {
    if (!amount || isNaN(Number(amount))) return;
    
    const numAmount = Number(amount);
    
    // Validation for both Deposit and Withdrawal
    if (numAmount > 100000) {
      alert("Maximum transaction amount is ₦100,000");
      return;
    }

    if (showModal === 'deposit' && numAmount < 50) {
      alert("Minimum deposit is ₦50");
      return;
    }

    if (showModal === 'withdraw') {
      if (numAmount < 50) {
        alert("Minimum withdrawal is ₦50");
        return;
      }
      if (numAmount > profile.wallet_balance) {
        alert("Insufficient balance");
        return;
      }
    }

    setIsProcessing(true);
    try {
      if (showModal === 'deposit') {
        // Paystack flow
        const res = await api.initPaystackTopup({
          amountNaira: numAmount,
          email: profile.email || `${profile.user_id}@routerider.com`
        });
        if (res.authorization_url) {
          window.location.href = res.authorization_url;
        }
      } else {
        // Withdrawal flow
        if (!isBankLinked) {
          setShowModal('link-bank');
          return;
        }
        await api.withdrawToBank({ amountNaira: numAmount });
        if (onTransaction) {
          await onTransaction({
            type: 'withdrawal',
            amount: numAmount,
            description: 'Bank Withdrawal (Pending)'
          });
        }
        setShowModal(null);
        setAmount('');
        alert("Withdrawal initiated! Funds will arrive in your bank account shortly.");
      }
    } catch (error: any) {
      alert(error.message || "Transaction failed. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleWithdrawClick = () => {
    if (isDriver && !isBankLinked) {
      setShowModal('link-bank');
    } else {
      setShowModal('withdraw');
    }
  };

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
      <div className={`${COLORS.primary} p-6 rounded-[2.5rem] text-white shadow-xl shadow-brand-primary/20 space-y-4 relative overflow-hidden`}>
        <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>
        <div className="space-y-1">
          <p className="text-white/60 text-[10px] font-black uppercase tracking-widest">
            {isDriver ? 'Available for Withdrawal' : 'Escrow Balance'}
          </p>
          <div className="text-4xl font-black">₦{profile.wallet_balance.toLocaleString()}</div>
        </div>
        <div className="flex gap-2">
          {isDriver ? (
            <>
              <button 
                onClick={handleWithdrawClick}
                className="flex-1 bg-white/20 backdrop-blur-md py-4 rounded-2xl font-black text-sm hover:bg-white/30 transition-colors"
              >
                Withdraw
              </button>
              <button 
                onClick={handleWithdrawClick}
                className="flex-1 bg-white text-brand-primary py-4 rounded-2xl font-black text-sm shadow-sm active:scale-95 transition-all"
              >
                Quick Payout
              </button>
            </>
          ) : (
            <button 
              onClick={() => setShowModal('deposit')}
              className="flex-1 bg-white text-brand-primary py-4 rounded-2xl font-black text-sm shadow-sm active:scale-95 transition-all"
            >
              Add Funds / Transfer
            </button>
          )}
        </div>
      </div>

      {/* Transaction Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 space-y-6 animate-in slide-in-from-bottom-10 duration-300">
            <div className="text-center space-y-2">
              <h3 className="text-2xl font-black">
                {showModal === 'deposit' ? 'Add Funds / Transfer' : 'Withdraw Earnings'}
              </h3>
              <p className="text-gray-500 text-sm font-bold">
                {showModal === 'deposit' ? 'Top up via Card or Bank Transfer' : 'Transfer to your linked bank account'}
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Amount (₦)</label>
                <input 
                  type="number" 
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="e.g. 5000"
                  className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xl outline-none focus:border-brand-primary transition-all"
                />
              </div>
              
              {showModal === 'withdraw' && (
                <div className="p-4 bg-brand-accent/5 rounded-2xl border border-brand-accent/10 flex gap-3">
                  <div className="text-brand-accent">{ICONS.Check}</div>
                  <p className="text-[10px] text-brand-primary font-bold leading-tight">
                    Funds will be sent to your verified bank account: {bankDetails?.bank_name} (**{bankDetails?.account_number?.slice(-4)})
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <button 
                onClick={handleAction}
                disabled={isProcessing || !amount}
                className="w-full bg-brand-primary text-white py-5 rounded-2xl font-black text-lg shadow-xl shadow-brand-primary/20 disabled:opacity-50 active:scale-95 transition-all"
              >
                {isProcessing ? 'Processing...' : showModal === 'deposit' ? 'Confirm Deposit' : 'Confirm Withdrawal'}
              </button>
              <button 
                onClick={() => setShowModal(null)}
                disabled={isProcessing}
                className="w-full py-4 text-gray-400 font-black text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal === 'link-bank' && (
        <BankAccountSetup 
          onSuccess={async () => {
            if (onRefreshProfile) await onRefreshProfile();
            setShowModal('withdraw');
          }}
          onCancel={() => setShowModal(null)}
        />
      )}

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
                    <div className="w-10 h-10 rounded-xl bg-brand-accent/10 flex items-center justify-center text-brand-accent">
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
                      ride.status === BookingStatus.ACCEPTED ? 'text-brand-accent' : 'text-amber-500'
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
          <button className="text-brand-accent text-[10px] font-black uppercase tracking-widest">Full History</button>
        </div>

        <div className="space-y-2">
          {transactions.length > 0 ? (
            transactions.map(tx => (
              <div key={tx.transaction_id} className="bg-white border-2 border-slate-100 p-4 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${tx.type === 'deposit' ? 'bg-brand-accent/10 text-brand-accent' : 'bg-orange-50 text-orange-600'}`}>
                    {tx.type === 'deposit' ? ICONS.Check : ICONS.Clock}
                  </div>
                  <div>
                    <div className="font-black text-sm">{tx.description}</div>
                    <div className="text-[10px] text-gray-400 font-bold">{new Date(tx.created_at).toLocaleDateString()}</div>
                  </div>
                </div>
                <div className={`font-black ${tx.type === 'deposit' ? 'text-brand-accent' : 'text-gray-900'}`}>
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
            ? 'Withdrawals are processed instantly to your linked bank account. Min: ₦50 | Max: ₦100,000.' 
            : 'Escrow payments are released 2 hours after departure. Deposit Min: ₦50 | Max: ₦100,000.'}
        </p>
      </div>
    </div>
  );
};

export default WalletView;
