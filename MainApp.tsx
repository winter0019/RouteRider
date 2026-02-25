import React, { useEffect, useState, useCallback } from "react";
import {
  BookingStatus,
  DriverProfile,
  Trip,
  Booking,
  Transaction,
} from "./types";
import { ICONS, COLORS } from "./constants";

import Dashboard from "./components/Dashboard";
import TripPosting from "./components/TripPosting";
import BookingManagement from "./components/BookingManagement";
import WalletView from "./components/Wallet";
import ProfileOnboarding from "./components/ProfileOnboarding";
import SettingsView from "./components/Settings";
import PassengerHome from "./components/PassengerHome";

import { api } from "./services/api";
import { firestoreService } from "./services/firestoreService";
import { auth, isFirebaseConfigured } from "./services/firebase";
import { sendEmailVerification } from "firebase/auth";

type Page = "dashboard" | "post-trip" | "bookings" | "wallet" | "settings" | "search";
type UserRole = "driver" | "passenger";

const MainApp: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>("dashboard");
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [allAvailableTrips, setAllAvailableTrips] = useState<Trip[]>([]);
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  // -------------------------
  // Local persistence helpers
  // -------------------------
  const persistTrips = (trips: Trip[]) => {
    setAllAvailableTrips(trips);
    localStorage.setItem("rr_all_trips", JSON.stringify(trips));
  };

  const persistActiveTrip = (trip: Trip | null) => {
    setActiveTrip(trip);
    if (trip) localStorage.setItem("rr_active_trip", JSON.stringify(trip));
    else localStorage.removeItem("rr_active_trip");
  };

  const persistBookings = (newBookings: Booking[]) => {
    setBookings(newBookings);
    localStorage.setItem("rr_bookings", JSON.stringify(newBookings));
  };

  const persistTransactions = (tx: Transaction[]) => {
    setTransactions(tx);
    localStorage.setItem("rr_transactions", JSON.stringify(tx));
  };

  const handleUpdateProfile = async (newProfile: DriverProfile) => {
    setProfile(newProfile);
    localStorage.setItem("rr_profile", JSON.stringify(newProfile));
    
    if (newProfile.user_id) {
      try {
        await firestoreService.updateUserProfile(newProfile.user_id, {
          full_name: newProfile.full_name,
          car_make: newProfile.car_make,
          car_model: newProfile.car_model,
          car_color: newProfile.car_color,
          plate_number: newProfile.plate_number,
          profile_photo_url: newProfile.profile_photo_url
        });
      } catch (error) {
        console.error("Failed to update profile in Firestore:", error);
      }
    }
  };

  // -------------------------
  // Logout
  // -------------------------
  const handleLogout = useCallback(() => {
    localStorage.removeItem("rr_profile");
    localStorage.removeItem("rr_role");
    localStorage.removeItem("rr_active_trip");
    localStorage.removeItem("rr_bookings");
    localStorage.removeItem("rr_transactions");

    setIsLoggedIn(false);
    setProfile(null);
    setUserRole(null);

    persistActiveTrip(null);
    persistBookings([]);
    persistTransactions([]);

    setCurrentPage("dashboard");
  }, []);

  // -------------------------
  // Firestore refresh (source of truth)
  // -------------------------
  const refreshTripsFromBackend = useCallback(async () => {
    try {
      const backendTrips = await api.getTrips();
      persistTrips(backendTrips);
      setGlobalError(null);
    } catch (error: any) {
      console.error("Failed to refresh trips:", error);
      if (error.code === 'permission-denied') {
        setGlobalError("Firestore Permission Denied. Please update your Security Rules.");
      }
    }
  }, []);

  const refreshBookingsFromBackend = useCallback(async () => {
    if (!activeTrip) return;
    try {
      // 1. Refresh bookings
      const backendBookings = await api.getBookingsForTrip(activeTrip.trip_id);
      persistBookings(backendBookings);

      // 2. Refresh the active trip itself to get latest seat count
      const updatedTrip = await api.getTrip(activeTrip.trip_id, activeTrip.source as any);
      if (updatedTrip) {
        persistActiveTrip(updatedTrip);
      }

      setGlobalError(null);
    } catch (error: any) {
      console.error("Failed to refresh bookings:", error);
      if (error.code === 'permission-denied') {
        setGlobalError("Firestore Permission Denied. Please update your Security Rules.");
      }
    }
  }, [activeTrip]);

  const refreshUserBookingsFromBackend = useCallback(async () => {
    if (!profile?.user_id) return;
    try {
      const backendBookings = await api.getBookingsForUser(profile.user_id);
      persistBookings(backendBookings);
      setGlobalError(null);
    } catch (error: any) {
      console.error("Failed to refresh user bookings:", error);
    }
  }, [profile?.user_id]);

  const refreshTransactionsFromBackend = useCallback(async () => {
    if (!profile?.user_id) return;
    try {
      const tx = await api.getTransactions(profile.user_id);
      persistTransactions(tx);
    } catch (error) {
      console.error("Failed to refresh transactions:", error);
    }
  }, [profile?.user_id]);

  const refreshWalletFromBackend = useCallback(async () => {
    if (!profile?.user_id) return;
    try {
      const wallet = await api.getMyWallet();
      if (wallet && typeof wallet.balance === 'number') {
        const updatedProfile = { ...profile, wallet_balance: wallet.balance };
        setProfile(updatedProfile);
        localStorage.setItem("rr_profile", JSON.stringify(updatedProfile));
      }
    } catch (error) {
      console.error("Failed to refresh wallet:", error);
    }
  }, [profile]);

  const handleTransaction = async (txData: { type: 'deposit' | 'withdrawal'; amount: number; description: string }) => {
    try {
      if (txData.description === 'Refresh') {
        await refreshWalletFromBackend();
        return;
      }
      const newTx = await api.createTransaction(txData);
      persistTransactions([newTx, ...transactions]);
      await refreshWalletFromBackend();
    } catch (error) {
      console.error("Transaction failed:", error);
      throw error;
    }
  };

  const handleCompleteTrip = async (tripId: string) => {
    try {
      await api.completeTrip(tripId);
      await Promise.all([
        refreshTripsFromBackend(),
        refreshWalletFromBackend(),
        refreshBookingsFromBackend()
      ]);
      alert("Trip completed and earnings released!");
    } catch (error: any) {
      console.error("Failed to complete trip:", error);
      alert(error.message || "Failed to complete trip");
    }
  };

  // -------------------------
  // Initial load + sync
  // -------------------------
  useEffect(() => {
    // 1. Try loading from localStorage first (fastest)
    const savedProfile = localStorage.getItem("rr_profile");
    const savedRole = localStorage.getItem("rr_role") as UserRole | null;

    const savedTrips = localStorage.getItem("rr_all_trips");
    const savedActiveTrip = localStorage.getItem("rr_active_trip");
    const savedBookings = localStorage.getItem("rr_bookings");
    const savedTransactions = localStorage.getItem("rr_transactions");

    if (savedProfile && savedRole) {
      const p = JSON.parse(savedProfile);
      setProfile(p);
      setUserRole(savedRole);
      setIsLoggedIn(true);
      if (savedRole === "passenger") setCurrentPage("search");
      refreshTripsFromBackend();
    }

    if (savedTrips) setAllAvailableTrips(JSON.parse(savedTrips));
    if (savedActiveTrip) setActiveTrip(JSON.parse(savedActiveTrip));
    if (savedBookings) setBookings(JSON.parse(savedBookings));
    if (savedTransactions) setTransactions(JSON.parse(savedTransactions));
  }, [refreshTripsFromBackend]);

  // 2. Listen for Auth changes to handle cross-device or cleared cache
  useEffect(() => {
    const unsubscribe = auth?.onAuthStateChanged(async (user) => {
      if (user) {
        try {
          const firestoreProfile = await firestoreService.getUserProfile(user.uid);
          if (firestoreProfile) {
            const p: DriverProfile = {
              user_id: user.uid,
              full_name: firestoreProfile.full_name,
              phone_number: firestoreProfile.phone_number || firestoreProfile.phone || 'N/A',
              car_make: firestoreProfile.car_make || 'N/A',
              car_model: firestoreProfile.car_model || 'N/A',
              car_color: firestoreProfile.car_color || 'Standard',
              plate_number: firestoreProfile.plate_number || 'N/A',
              verification_status: firestoreProfile.verification_status || { phone: true, id: true, first_trip: false },
              rating: firestoreProfile.rating || 5.0,
              trip_count: firestoreProfile.trip_count || 0,
              wallet_balance: firestoreProfile.wallet_balance || 0,
              total_earnings: firestoreProfile.total_earnings || 0,
              profile_photo_url: firestoreProfile.profile_photo_url
            };
            const role = (firestoreProfile.userType || 'passenger') as UserRole;
            
            setProfile(p);
            setUserRole(role);
            setIsLoggedIn(true);
            
            localStorage.setItem("rr_profile", JSON.stringify(p));
            localStorage.setItem("rr_role", role);
            
            if (role === "passenger") setCurrentPage("search");
            refreshTripsFromBackend();
          }
        } catch (error) {
          console.error("Error fetching profile from Firestore:", error);
        }
      } else {
        setIsLoggedIn(prev => {
          if (prev) {
            handleLogout();
          }
          return false;
        });
      }
      setIsLoading(false);
    });

    return () => unsubscribe?.();
  }, [refreshTripsFromBackend, handleLogout]);

  // Sync bookings for driver
  useEffect(() => {
    if (userRole === 'driver' && activeTrip && isLoggedIn) {
      refreshBookingsFromBackend();
      const interval = setInterval(refreshBookingsFromBackend, 10000); // Poll every 10s
      return () => clearInterval(interval);
    }
  }, [userRole, activeTrip, isLoggedIn, refreshBookingsFromBackend]);

  // Sync bookings for passenger
  useEffect(() => {
    if (userRole === 'passenger' && isLoggedIn) {
      refreshUserBookingsFromBackend();
      const interval = setInterval(refreshUserBookingsFromBackend, 10000); // Poll every 10s
      return () => clearInterval(interval);
    }
  }, [userRole, isLoggedIn, refreshUserBookingsFromBackend]);

  // Sync transactions
  useEffect(() => {
    if (isLoggedIn && currentPage === 'wallet') {
      refreshTransactionsFromBackend();
      refreshWalletFromBackend();
    }
  }, [isLoggedIn, currentPage, refreshTransactionsFromBackend, refreshWalletFromBackend]);

  // Sync wallet on dashboard
  useEffect(() => {
    if (isLoggedIn && currentPage === 'dashboard') {
      refreshWalletFromBackend();
    }
  }, [isLoggedIn, currentPage, refreshWalletFromBackend]);

  // optional: refresh when tab becomes active
  useEffect(() => {
    const onFocus = () => {
      if (isLoggedIn) {
        refreshTripsFromBackend();
        refreshTransactionsFromBackend();
        if (userRole === 'driver') {
          refreshBookingsFromBackend();
        } else if (userRole === 'passenger') {
          refreshUserBookingsFromBackend();
        }
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [isLoggedIn, userRole, refreshTripsFromBackend, refreshBookingsFromBackend, refreshUserBookingsFromBackend]);

  // -------------------------
  // Driver: Post Trip
  // -------------------------
  const handlePostTrip = async (tripDraft: Trip) => {
    try {
      const savedTrip = await api.postTrip(tripDraft);
      persistActiveTrip(savedTrip);

      // IMPORTANT: refresh so passengers see it
      await refreshTripsFromBackend();
    } catch (error) {
      console.error("Failed to post trip:", error);

      // fallback local-only (not ideal, but keeps UI alive)
      persistActiveTrip(tripDraft);
      persistTrips([tripDraft, ...allAvailableTrips]);
    }
  };

  // -------------------------
  // Passenger: Book Trip
  // -------------------------
  const handleBookTrip = async (trip: Trip, method: 'wallet' | 'paystack') => {
    try {
      if (method === 'wallet') {
        // Use the secure wallet-based booking
        await api.bookTripWithWallet(trip.trip_id);
      } else {
        // Paystack flow
        const res = await api.initPaystackBooking({
          rideId: trip.trip_id,
          email: profile?.email || `${profile?.user_id}@routerider.com`
        });
        if (res.authorization_url) {
          window.location.href = res.authorization_url;
          return; // Redirecting
        }
      }

      // refresh everything
      await Promise.all([
        refreshTripsFromBackend(),
        refreshUserBookingsFromBackend(),
        refreshTransactionsFromBackend()
      ]);
      
      // Refresh profile to get new balance
      const updatedProfile = await api.getProfile(profile!.user_id);
      if (updatedProfile) {
        setProfile(updatedProfile as any);
        localStorage.setItem("rr_profile", JSON.stringify(updatedProfile));
      }
    } catch (error: any) {
      console.error("Failed to book trip:", error);
      alert(error.message || "Booking failed. Check your wallet balance.");
      throw error;
    }
  };

  // -------------------------
  // Onboarding
  // -------------------------
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white">
        <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <h2 className="text-xl font-black text-emerald-900">RouteRider</h2>
        <p className="text-gray-500 font-bold">Loading your profile...</p>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <ProfileOnboarding
        onComplete={async (p, role) => {
          if (auth?.currentUser) {
            try {
              await firestoreService.createUserProfile(auth.currentUser.uid, {
                ...p,
                userType: role,
              });
            } catch (error) {
              console.error("Firestore Error (createUserProfile):", error);
            }
          }

          setProfile(p);
          setUserRole(role);
          setIsLoggedIn(true);

          localStorage.setItem("rr_profile", JSON.stringify(p));
          localStorage.setItem("rr_role", role);

          if (role === "passenger") setCurrentPage("search");

          // after login, refresh trips too
          refreshTripsFromBackend();
        }}
      />
    );
  }

  // -------------------------
  // Page render
  // -------------------------
  const renderPage = () => {
    if (userRole === "passenger") {
      switch (currentPage) {
        case "search":
          return <PassengerHome trips={allAvailableTrips} onBook={handleBookTrip} />;
        case "wallet":
          return (
            <WalletView
              profile={profile!}
              transactions={transactions}
              userRole={userRole}
              bookings={bookings}
              onTransaction={handleTransaction}
            />
          );
        case "settings":
          return (
            <SettingsView
              profile={profile!}
              onLogout={handleLogout}
              onUpdate={handleUpdateProfile}
              userRole={userRole}
            />
          );
        default:
          return <PassengerHome trips={allAvailableTrips} onBook={handleBookTrip} />;
      }
    }

    // driver
    switch (currentPage) {
      case "dashboard":
        return (
          <Dashboard
            profile={profile!}
            activeTrip={activeTrip}
            bookings={bookings}
            onNavigate={setCurrentPage}
            onCompleteTrip={handleCompleteTrip}
          />
        );
      case "post-trip":
        return (
          <TripPosting
            onPost={handlePostTrip}
            activeTrip={activeTrip}
            onNavigate={setCurrentPage}
            profile={profile!}
          />
        );
      case "bookings":
        return (
          <BookingManagement
            bookings={bookings}
            setBookings={persistBookings}
            activeTrip={activeTrip}
            setActiveTrip={persistActiveTrip}
            setTransactions={setTransactions}
            setProfile={setProfile}
          />
        );
      case "wallet":
        return (
          <WalletView
            profile={profile!}
            transactions={transactions}
            userRole={userRole}
            bookings={bookings}
            onTransaction={handleTransaction}
          />
        );
      case "settings":
        return (
          <SettingsView
            profile={profile!}
            onLogout={handleLogout}
            onUpdate={handleUpdateProfile}
            userRole={userRole}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col min-h-screen max-w-md mx-auto bg-white shadow-xl relative overflow-hidden text-black font-bold">
      {!isFirebaseConfigured() && (
        <div className="bg-amber-50 border-b border-amber-100 p-3 text-[10px] text-amber-800 text-center font-black uppercase tracking-tight">
          ⚠️ Firebase not configured. Check .env.example
        </div>
      )}
      {globalError && (
        <div className="bg-red-600 text-white p-3 text-[10px] text-center font-black uppercase tracking-tight animate-pulse">
          ⚠️ {globalError}
        </div>
      )}
      {isLoggedIn && auth?.currentUser && !auth.currentUser.emailVerified && (
        <div className="bg-amber-500 text-white p-3 text-[10px] flex items-center justify-between font-black uppercase tracking-tight">
          <span>⚠️ Verify your email to unlock all features</span>
          <button 
            onClick={async () => {
              try {
                await sendEmailVerification(auth.currentUser!);
                alert("Verification email sent!");
              } catch (err) {
                console.error(err);
                alert("Failed to send verification email.");
              }
            }}
            className="bg-white text-amber-600 px-2 py-1 rounded-md text-[8px]"
          >
            Resend
          </button>
        </div>
      )}
      <header className="px-4 py-4 flex items-center justify-between border-b sticky top-0 bg-white z-10">
        <button
          onClick={() => setCurrentPage(userRole === "passenger" ? "search" : "dashboard")}
          className="flex items-center gap-2"
        >
          <div className={`w-8 h-8 ${COLORS.primary} rounded-full flex items-center justify-center text-white font-black`}>
            R
          </div>
          <h1 className="font-black text-xl">RouteRider</h1>
        </button>

        <div className="flex items-center gap-3">
          <div className="text-[10px] font-black uppercase text-gray-400 bg-slate-100 px-2 py-1 rounded-md">
            {userRole}
          </div>

          <button
            onClick={() => setCurrentPage("settings")}
            className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden border-2 border-emerald-50 shadow-sm"
          >
            <img
              src={profile?.profile_photo_url || `https://picsum.photos/100/100?seed=${profile?.user_id}`}
              alt="Me"
              className="w-full h-full object-cover"
            />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-24 p-4">{renderPage()}</main>

      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t px-6 py-3 flex justify-between items-center z-20 shadow-[0_-4px_20px_rgba(0,0,0,0.1)]">
        {userRole === "driver" ? (
          <>
            <NavItem active={currentPage === "dashboard"} onClick={() => setCurrentPage("dashboard")} icon={ICONS.Dashboard} label="Home" />
            <NavItem active={currentPage === "post-trip"} onClick={() => setCurrentPage("post-trip")} icon={ICONS.Post} label="Post" />
            <NavItem
              active={currentPage === "bookings"}
              onClick={() => setCurrentPage("bookings")}
              icon={ICONS.Notification}
              label="Bookings"
              badge={bookings.filter((b) => b.status === BookingStatus.PENDING).length}
            />
            <NavItem active={currentPage === "wallet"} onClick={() => setCurrentPage("wallet")} icon={ICONS.Wallet} label="Wallet" />
          </>
        ) : (
          <>
            <NavItem active={currentPage === "search"} onClick={() => setCurrentPage("search")} icon={ICONS.Car} label="Find Rides" />
            <NavItem active={currentPage === "wallet"} onClick={() => setCurrentPage("wallet")} icon={ICONS.Wallet} label="My Trips" />
            <NavItem active={currentPage === "settings"} onClick={() => setCurrentPage("settings")} icon={ICONS.User} label="Profile" />
          </>
        )}
      </nav>
    </div>
  );
};

const NavItem: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}> = ({ active, onClick, icon, label, badge }) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center gap-1 relative transition-all ${
      active ? "text-emerald-700 scale-110" : "text-gray-500"
    }`}
  >
    <div className="relative">
      {icon}
      {badge && badge > 0 ? (
        <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-black">
          {badge}
        </span>
      ) : null}
    </div>
    <span className="text-[10px] font-black">{label}</span>
  </button>
);

export default MainApp;
