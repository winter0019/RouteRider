
import React, { useState } from 'react';
import { api } from '../services/api';
import { ICONS, COLORS } from '../constants';

interface BankAccountSetupProps {
  onSuccess: () => void;
  onCancel: () => void;
}

const NIGERIAN_BANKS = [
  { name: 'Access Bank', code: '044' },
  { name: 'Access Bank (Diamond)', code: '063' },
  { name: 'ALAT by WEMA', code: '035A' },
  { name: 'ASO Savings and Loans', code: '401' },
  { name: 'Bowen Microfinance Bank', code: '50931' },
  { name: 'Carbon', code: '565' },
  { name: 'CEMCS Microfinance Bank', code: '50823' },
  { name: 'Citibank Nigeria', code: '023' },
  { name: 'Ecobank Nigeria', code: '050' },
  { name: 'Ekondo Microfinance Bank', code: '562' },
  { name: 'Eyowo', code: '50126' },
  { name: 'Fidelity Bank', code: '070' },
  { name: 'First Bank of Nigeria', code: '011' },
  { name: 'First City Monument Bank', code: '214' },
  { name: 'Globus Bank', code: '00103' },
  { name: 'Guaranty Trust Bank', code: '058' },
  { name: 'Hasal Microfinance Bank', code: '50383' },
  { name: 'Heritage Bank', code: '030' },
  { name: 'Jaiz Bank', code: '301' },
  { name: 'Keystone Bank', code: '082' },
  { name: 'Kuda Bank', code: '50211' },
  { name: 'Lagos Building Investment Company PLC', code: '090005' },
  { name: 'Mayfair Microfinance Bank', code: '50563' },
  { name: 'Mint MFB', code: '50304' },
  { name: 'Moniepoint MFB', code: '50515' },
  { name: 'OPay Digital Services Limited (OPay)', code: '999992' },
  { name: 'Paga', code: '100002' },
  { name: 'PalmPay', code: '999991' },
  { name: 'Parallex Bank', code: '104' },
  { name: 'Parkway - ReadyCash', code: '311' },
  { name: 'Paycom', code: '999992' },
  { name: 'Petra Mircofinance Bank Plc', code: '50746' },
  { name: 'Polaris Bank', code: '076' },
  { name: 'Providus Bank', code: '101' },
  { name: 'Rubies MFB', code: '125' },
  { name: 'Safe Haven MFB', code: '51310' },
  { name: 'Sparkle Microfinance Bank', code: '51311' },
  { name: 'Stanbic IBTC Bank', code: '039' },
  { name: 'Standard Chartered Bank', code: '068' },
  { name: 'Sterling Bank', code: '232' },
  { name: 'Suntrust Bank', code: '100' },
  { name: 'TAJ Bank', code: '302' },
  { name: 'Tangerine Money', code: '51269' },
  { name: 'TCF MFB', code: '51211' },
  { name: 'Titan Bank', code: '102' },
  { name: 'Union Bank of Nigeria', code: '032' },
  { name: 'United Bank for Africa', code: '033' },
  { name: 'Unity Bank', code: '215' },
  { name: 'VFD Microfinance Bank Limited', code: '566' },
  { name: 'Wema Bank', code: '035' },
  { name: 'Zenith Bank', code: '057' },
];

const BankAccountSetup: React.FC<BankAccountSetupProps> = ({ onSuccess, onCancel }) => {
  const [bankCode, setBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const handleVerify = async () => {
    if (!bankCode || accountNumber.length !== 10) return;
    
    setIsVerifying(true);
    setError('');
    try {
      const res = await api.verifyBankAccount({ bank_code: bankCode, account_number: accountNumber });
      if (res.success) {
        setAccountName(res.account_name);
      } else {
        setError(res.message || 'Verification failed');
      }
    } catch (err: any) {
      setError(err.message || 'Could not verify account');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSave = async () => {
    if (!accountName) return;
    
    setIsSaving(true);
    setError('');
    try {
      const bank = NIGERIAN_BANKS.find(b => b.code === bankCode);
      await api.saveBankDetails({
        bank_name: bank?.name || 'Unknown Bank',
        bank_code: bankCode,
        account_number: accountNumber,
        account_name: accountName
      });
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to save bank details');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 space-y-6 animate-in slide-in-from-bottom-10 duration-300">
        <div className="text-center space-y-2">
          <h3 className="text-2xl font-black">Link Bank Account</h3>
          <p className="text-gray-500 text-sm font-bold">
            Required for instant payouts to your local bank
          </p>
        </div>

        {error && (
          <div className="p-4 bg-red-50 rounded-2xl border border-red-100 flex gap-3 text-red-600">
            <div className="shrink-0">{ICONS.Alert}</div>
            <p className="text-[10px] font-bold leading-tight">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Select Bank</label>
            <select
              value={bankCode}
              onChange={(e) => {
                setBankCode(e.target.value);
                setAccountName('');
              }}
              className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-sm outline-none focus:border-brand-primary transition-all appearance-none"
            >
              <option value="">Choose your bank...</option>
              {NIGERIAN_BANKS.map(bank => (
                <option key={bank.code} value={bank.code}>{bank.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Account Number</label>
            <input 
              type="text" 
              maxLength={10}
              value={accountNumber}
              onChange={e => {
                setAccountNumber(e.target.value.replace(/\D/g, ''));
                setAccountName('');
              }}
              placeholder="10-digit account number"
              className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-sm outline-none focus:border-brand-primary transition-all"
            />
          </div>

          {accountName && (
            <div className="p-4 bg-brand-accent/10 rounded-2xl border border-brand-accent/20 space-y-1">
              <p className="text-[10px] text-brand-accent font-black uppercase tracking-widest">Account Name</p>
              <p className="text-sm font-black text-brand-primary">{accountName}</p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          {!accountName ? (
            <button 
              onClick={handleVerify}
              disabled={isVerifying || !bankCode || accountNumber.length !== 10}
              className="w-full bg-brand-primary text-white py-5 rounded-2xl font-black text-lg shadow-xl shadow-brand-primary/20 disabled:opacity-50 active:scale-95 transition-all"
            >
              {isVerifying ? 'Verifying...' : 'Verify Account'}
            </button>
          ) : (
            <button 
              onClick={handleSave}
              disabled={isSaving}
              className="w-full bg-brand-primary text-white py-5 rounded-2xl font-black text-lg shadow-xl shadow-brand-primary/20 disabled:opacity-50 active:scale-95 transition-all"
            >
              {isSaving ? 'Saving...' : 'Link Account'}
            </button>
          )}
          <button 
            onClick={onCancel}
            disabled={isVerifying || isSaving}
            className="w-full py-4 text-gray-400 font-black text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default BankAccountSetup;
