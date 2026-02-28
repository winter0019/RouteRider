
import React from 'react';
import { 
  LayoutDashboard, 
  MapPin, 
  Wallet, 
  Settings, 
  PlusCircle, 
  User, 
  CheckCircle2, 
  AlertCircle,
  Clock,
  Car,
  ChevronRight,
  LogOut,
  Bell,
  Star,
  ArrowRightLeft,
  Info
} from 'lucide-react';

export const ROUTES = {
  SUGGESTED_PRICE_PER_SEAT: 3500,
  COMMISSION_PER_TRIP: 1000,
  NO_SHOW_COMPENSATION: 2000
};

export const COLORS = {
  primary: 'bg-brand-primary',
  primaryText: 'text-brand-primary',
  secondary: 'bg-brand-secondary',
  secondaryText: 'text-brand-secondary',
  accent: 'bg-brand-accent',
  accentText: 'text-brand-accent',
  background: 'bg-slate-50',
};

export const ICONS = {
  Dashboard: <LayoutDashboard size={20} />,
  Post: <PlusCircle size={20} />,
  Wallet: <Wallet size={20} />,
  Settings: <Settings size={20} />,
  User: <User size={20} />,
  Check: <CheckCircle2 size={16} />,
  Alert: <AlertCircle size={16} />,
  Clock: <Clock size={16} />,
  Car: <Car size={16} />,
  ChevronRight: <ChevronRight size={20} />,
  Logout: <LogOut size={20} />,
  Notification: <Bell size={20} />,
  Star: <Star size={16} fill="currentColor" />,
  Swap: <ArrowRightLeft size={18} />,
  Info: <Info size={16} />,
};
