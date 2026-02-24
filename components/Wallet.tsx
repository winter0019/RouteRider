import React, { useEffect, useMemo, useState } from "react";
import { DriverProfile, Transaction, Booking, BookingStatus } from "../types";
import { ICONS, COLORS } from "../constants";
import { api } from "../services/api";

interface WalletProps {
  profile: DriverProfile;
  transactions: Transaction[];
  userRole: "driver" | "passenger";
  bookings?: Booking[];
  onTransaction?: (tx: {
    type: "deposit" | "withdrawal";
    amount: number;
    description: string;
  }) => Promise<void>;
}

const WalletView: React.FC<WalletProps> = ({
  profile,
  transactions,
  userRole,
  bookings = [],
  onTransaction,
}) => {
  const isDriver = userRole === "driver";
  const [showModal, setShowModal] = useState<"deposit" | "withdraw" | null>(null);
  const [amount, setAmount] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  /**
   * ✅ ONLY ONE Paystack reference handler
   * - reads ?reference=...
   * - verifies on backend
   * - cleans URL
   * - triggers parent refresh (wallet + txs) via onTransaction callback
   */
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("reference");
    if (!ref) return;

    (async () => {
      setIsProcessing(true);
      try {
        await api.verifyPaystack(ref);

        // clean URL so it doesn't re-verify on refresh
        window.history.replaceState({}, document.title, window.location.pathname);

        // trigger refresh in parent (recommended: parent re-fetches wallet + txs)
        if (onTransaction) {
          await onTransaction({
            type: "deposit",
            amount: 0,
            description: "Paystack verified",
          });
        }

        alert("Payment verified! Your balance will update now.");
      } catch (e: any) {
        console.error("verifyPaystack failed:", e);
        alert(e?.message || "Payment verification failed.");
      } finally {
        setIsProcessing(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Passenger: show rides (bookings)
  const myRides = useMemo(() => {
    const pid = profile?.user_id;
    const pname = profile?.full_name;
    return (bookings || []).filter(
      (b) => b.passenger_id === pid || (!!pname && b.passenger_name === pname)
    );
  }, [bookings, profile?.user_id, profile?.full_name]);

  const walletBalance = Number(profile?.wallet_balance || 0);

  const handleAction = async () => {
    if (!amount || isNaN(Number(amount))) return;

    const numAmount = Number(amount);

    if (showModal === "withdraw" && numAmount < 5000) {
      alert("Minimum withdrawal is ₦5,000");
      return;
    }
    if (showModal === "withdraw" && numAmount > walletBalance) {
      alert("Insufficient balance");
      return;
    }

    setIsProcessing(true);
    try {
      if (showModal === "deposit") {
        const res: any = await api.initPaystackTopup({
          amountNaira: numAmount,
          email: profile.email || `${profile.user_id}@routerider.com`,
        });

        if (res?.authorization_url) {
          window.location.href = res.authorization_url;
        } else {
          throw new Error("Paystack initialization failed (missing authorization_url)");
        }
      } else {
        // Withdrawal flow (backend must implement POST /api/wallet/withdraw)
        await api.withdrawToBank({ amountNaira: numAmount });

        if (onTransaction) {
          await onTransaction({
            type: "withdrawal",
            amount: numAmount,
            description: "Bank Withdrawal",
          });
        }

        setShowModal(null);
        setAmount("");
        alert("Withdrawal successful!");
      }
    } catch (error: any) {
      alert(error?.message || "Transaction failed. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-black">{isDriver ? "My Wallet" : "My Trips & Wallet"}</h2>
        <p className="text-gray-500 text-sm font-bold">
          {isDriver ? "Manage your earnings and withdrawals" : "Track your rides and payments"}
        </p>
      </header>

      {/* Balance Card */}
      <div
        className={`${COLORS.primary} p-6 rounded-[2.5rem] text-white shadow-xl shadow-emerald-100 space-y-4 relative overflow-hidden`}
      >
        <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>

        <div className="space-y-1">
          <p className="text-emerald-100 text-[10px] font-black uppercase tracking-widest">
            {isDriver ? "Available for Withdrawal" : "Escrow Balance"}
          </p>
          <div className="text-4xl font-black">₦{walletBalance.toLocaleString()}</div>
        </div>

        <div className="flex gap-2">
          {isDriver ? (
            <>
              <button
                onClick={() => setShowModal("withdraw")}
                className="flex-1 bg-white/20 backdrop-blur-md py-4 rounded-2xl font-black text-sm hover:bg-white/30 transition-colors"
              >
                Withdraw
              </button>
              <button
                onClick={() => setShowModal("withdraw")}
                className="flex-1 bg-white text-emerald-600 py-4 rounded-2xl font-black text-sm shadow-sm active:scale-95 transition-all"
              >
                Quick Payout
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowModal("deposit")}
              className="flex-1 bg-white text-emerald-600 py-4 rounded-2xl font-black text-sm shadow-sm active:scale-95 transition-all"
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
                {showModal === "deposit" ? "Add Funds / Transfer" : "Withdraw Earnings"}
              </h3>
              <p className="text-gray-500 text-sm font-bold">
                {showModal === "deposit"
                  ? "Top up via Card or Bank Transfer"
                  : "Transfer to your linked bank account"}
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">
                  Amount (₦)
                </label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="e.g. 5000"
                  className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xl outline-none focus:border-emerald-500 transition-all"
                />
              </div>

              {showModal === "withdraw" && (
                <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex gap-3">
                  <div className="text-emerald-600">{ICONS.Check}</div>
                  <p className="text-[10px] text-emerald-800 font-bold leading-tight">
                    Funds will be sent to your verified bank account.
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={handleAction}
                disabled={isProcessing || !amount}
                className="w-full bg-emerald-600 text-white py-5 rounded-2xl font-black text-lg shadow-xl shadow-emerald-100 disabled:opacity-50 active:scale-95 transition-all"
              >
                {isProcessing
                  ? "Processing..."
                  : showModal === "deposit"
                  ? "Confirm Deposit"
                  : "Confirm Withdrawal"}
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

      {/* Passenger Specific: My Rides */}
      {!isDriver && (
        <section className="space-y-4 pt-2">
          <div className="flex justify-between items-center px-1">
            <h3 className="font-black text-xs text-gray-400 uppercase tracking-widest">
              Active Rides
            </h3>
            <span className="text-[10px] bg-slate-100 text-slate-500 font-black px-2 py-0.5 rounded-full">
              {myRides.length} Total
            </span>
          </div>

          <div className="space-y-3">
            {myRides.length > 0 ? (
              myRides.map((ride) => (
                <div
                  key={ride.booking_id}
                  className="bg-white border-2 border-slate-100 p-4 rounded-3xl flex items-center justify-between shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                      {ICONS.Car}
                    </div>
                    <div>
                      <div className="font-black text-sm">Trip</div>
                      <div className="text-[10px] text-gray-400 font-bold">
                        {ride.created_at ? new Date(ride.created_at).toLocaleDateString() : ""}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-black text-sm">₦{Number(ride.amount_paid || 0)}</div>
                    <div
                      className={`text-[10px] font-black uppercase ${
                        ride.status === BookingStatus.ACCEPTED ? "text-emerald-600" : "text-amber-500"
                      }`}
                    >
                      {ride.status}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl">
                <p className="text-sm font-black text-slate-400">No active bookings found</p>
                <p className="text-[10px] text-slate-300 font-bold uppercase mt-1">
                  Book your first seat today
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Transactions Section */}
      <section className="space-y-4">
        <div className="flex justify-between items-center px-1">
          <h3 className="font-black text-xs text-gray-400 uppercase tracking-widest">
            Recent Activity
          </h3>
          <button className="text-emerald-600 text-[10px] font-black uppercase tracking-widest">
            Full History
          </button>
        </div>

        <div className="space-y-2">
          {transactions.length > 0 ? (
            transactions.map((tx) => (
              <div
                key={tx.transaction_id}
                className="bg-white border-2 border-slate-100 p-4 rounded-2xl flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`p-2 rounded-xl ${
                      tx.type === "deposit"
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-orange-50 text-orange-600"
                    }`}
                  >
                    {tx.type === "deposit" ? ICONS.Check : ICONS.Clock}
                  </div>
                  <div>
                    <div className="font-black text-sm">{tx.description}</div>
                    <div className="text-[10px] text-gray-400 font-bold">
                      {tx.created_at ? new Date(tx.created_at).toLocaleDateString() : ""}
                    </div>
                  </div>
                </div>
                <div className={`font-black ${tx.type === "deposit" ? "text-emerald-600" : "text-gray-900"}`}>
                  {tx.type === "deposit" ? "+" : "-"}₦{Number(tx.amount || 0).toLocaleString()}
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
            ? "Withdrawals are processed instantly to your linked bank account. Minimum withdrawal is ₦5,000."
            : "Escrow payments are automatically released to the car owner after the trip is completed unless you report an issue."}
        </p>
      </div>
    </div>
  );
};

export default WalletView;
