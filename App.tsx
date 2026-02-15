import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { ShoppingCart, RefreshCcw, Scan, Volume2, Coins } from 'lucide-react';

// --- Types ---
type AppState = 'START' | 'SCANNING' | 'PAYMENT';

// --- Constants ---
const ITEM_PRICE = 110;
const SCAN_COOLDOWN_MS = 2000; // Prevent accidental double scans

const App: React.FC = () => {
  // State
  const [appState, setAppState] = useState<AppState>('START');
  const [count, setCount] = useState(0);
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);

  // Refs
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastScanTimeRef = useRef<number>(0);
  const scannerContainerId = "reader";

  // --- Audio Logic ---

  // Initialize AudioContext (must be done on user interaction)
  const initAudio = () => {
    if (!audioContextRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        audioContextRef.current = new AudioContext();
      }
    }
    // Resume if suspended (common in browsers)
    if (audioContextRef.current?.state === 'suspended') {
      audioContextRef.current.resume();
    }
  };

  const playBeep = useCallback(() => {
    if (!audioContextRef.current) return;
    try {
      const ctx = audioContextRef.current;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(1200, ctx.currentTime); // High pitch beep
      oscillator.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.1);

      gainNode.gain.setValueAtTime(0.5, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.15);
    } catch (e) {
      console.error("Audio error", e);
    }
  }, []);

  const speakPrice = useCallback(() => {
    if (!window.speechSynthesis) return;

    // Cancel any current speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance("ひゃくじゅうえん");
    utterance.lang = 'ja-JP';
    utterance.rate = 1.0;
    utterance.pitch = 1.2; // Slightly higher pitch for kids friendliness
    utterance.volume = 1.0;

    window.speechSynthesis.speak(utterance);
  }, []);

  // --- Scanner Logic ---

  const handleScanSuccess = useCallback((decodedText: string) => {
    const now = Date.now();
    // Throttling to prevent rapid double scans of the same barcode
    if (now - lastScanTimeRef.current < SCAN_COOLDOWN_MS) {
      return;
    }

    lastScanTimeRef.current = now;
    setLastScannedCode(decodedText);

    // Update State
    setCount(prev => prev + 1);

    // Audio Feedback
    playBeep();
    speakPrice();

  }, [playBeep, speakPrice]);

  const startScanner = useCallback(async () => {
    try {
      if (scannerRef.current) {
        // If already running, don't restart
        return;
      }

      const html5QrCode = new Html5Qrcode(scannerContainerId);
      scannerRef.current = html5QrCode;

      const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
      };

      await html5QrCode.start(
        { facingMode: "environment" },
        config,
        handleScanSuccess,
        (errorMessage) => {
          // parse error, ignore mostly
        }
      );
      setScannerError(null);
    } catch (err) {
      console.error("Error starting scanner", err);
      setScannerError("カメラを起動できませんでした。権限を確認してください。");
    }
  }, [handleScanSuccess]);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
           await scannerRef.current.stop();
        }
        scannerRef.current.clear();
        scannerRef.current = null;
      } catch (err) {
        console.error("Failed to stop scanner", err);
      }
    }
  }, []);

  // --- Effects ---

  // Manage Scanner Lifecycle based on AppState
  useEffect(() => {
    if (appState === 'SCANNING') {
      // Delay slightly to ensure DOM is ready
      const timer = setTimeout(() => {
        startScanner();
      }, 100);
      return () => {
        clearTimeout(timer);
        stopScanner();
      };
    } else {
      stopScanner();
    }
  }, [appState, startScanner, stopScanner]);

  // --- Handlers ---

  const handleStart = () => {
    initAudio();
    // Pre-warm speech synthesis (iOS quirk)
    if (window.speechSynthesis) {
        const u = new SpeechSynthesisUtterance("");
        window.speechSynthesis.speak(u);
    }
    setPermissionGranted(true);
    setAppState('SCANNING');
  };

  const handlePayment = () => {
    setAppState('PAYMENT');
  };

  const handleReset = () => {
    setCount(0);
    setLastScannedCode(null);
    setAppState('SCANNING');
  };

  // --- Render Components ---

  // Screen 1: Start / Permissions
  if (appState === 'START') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 bg-yellow-100 text-center">
        <div className="mb-8 p-6 bg-white rounded-full shadow-xl">
          <ShoppingCart size={80} className="text-orange-500" />
        </div>
        <h1 className="text-4xl font-bold mb-4 text-orange-600">100円レジ</h1>
        <p className="text-xl mb-12 text-gray-600">学校・遊び用（登録不要）</p>
        
        <button
          onClick={handleStart}
          className="w-full max-w-md bg-orange-500 hover:bg-orange-600 text-white text-3xl font-bold py-8 px-6 rounded-3xl shadow-lg transform transition active:scale-95 flex items-center justify-center gap-4"
        >
          <Scan size={40} />
          レジをはじめる
        </button>
        <p className="mt-6 text-sm text-gray-500">
          ※ボタンを押して、カメラと音声を許可してください
        </p>
      </div>
    );
  }

  // Screen 2: Payment / Result
  if (appState === 'PAYMENT') {
    return (
      <div className="flex flex-col items-center justify-between h-full p-6 bg-green-50">
        <div className="w-full flex-1 flex flex-col items-center justify-center">
          <h2 className="text-3xl font-bold text-green-700 mb-8">お支払い</h2>
          
          <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-md text-center border-4 border-green-200">
            <p className="text-gray-500 text-xl mb-2">ぜんぶで</p>
            <div className="text-8xl font-black text-gray-800 mb-4">
              {count}<span className="text-4xl font-normal ml-2">個</span>
            </div>
            <div className="h-1 w-full bg-gray-200 my-4 rounded"></div>
            <p className="text-gray-500 text-xl mb-2">ごうけい</p>
            <div className="text-7xl font-black text-green-600">
              {(count * ITEM_PRICE).toLocaleString()}<span className="text-3xl text-gray-600 ml-2">円</span>
            </div>
          </div>
        </div>

        <button
          onClick={handleReset}
          className="w-full max-w-md bg-blue-500 hover:bg-blue-600 text-white text-3xl font-bold py-6 px-6 rounded-2xl shadow-lg transform transition active:scale-95 flex items-center justify-center gap-3 mb-4"
        >
          <RefreshCcw size={36} />
          つぎの人（リセット）
        </button>
      </div>
    );
  }

  // Screen 3: Scanning (Main)
  return (
    <div className="flex flex-col h-full bg-blue-50">
      {/* Header Display */}
      <div className="bg-white p-4 shadow-md z-10 rounded-b-3xl mx-2 mt-2 border-b-4 border-blue-100">
        <div className="flex justify-between items-end mb-2">
          <span className="text-gray-500 font-bold text-lg">100円ショップの商品</span>
          <span className="bg-orange-100 text-orange-600 px-3 py-1 rounded-full text-sm font-bold">1つ 110円</span>
        </div>
        <div className="flex justify-between items-center">
          <div className="text-left">
            <span className="block text-sm text-gray-400 font-bold">個数</span>
            <span className="text-5xl font-black text-gray-800">{count}</span>
          </div>
          <div className="text-right">
            <span className="block text-sm text-gray-400 font-bold">合計金額</span>
            <div className="text-6xl font-black text-orange-500 leading-none">
              {(count * ITEM_PRICE).toLocaleString()}<span className="text-2xl text-gray-500 ml-1">円</span>
            </div>
          </div>
        </div>
      </div>

      {/* Camera Area */}
      <div className="flex-1 relative overflow-hidden flex flex-col justify-center items-center p-4">
        <div className="relative w-full max-w-sm aspect-square bg-black rounded-3xl overflow-hidden shadow-inner border-4 border-gray-300">
          {scannerError ? (
             <div className="absolute inset-0 flex items-center justify-center text-white p-4 text-center">
               {scannerError}
             </div>
          ) : (
            <div id={scannerContainerId} className="w-full h-full" />
          )}
          
          {/* Overlay Guide */}
          <div className="absolute inset-0 pointer-events-none border-2 border-white/30 rounded-3xl">
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-48 border-4 border-orange-400/70 rounded-xl"></div>
            <p className="absolute bottom-4 left-0 right-0 text-center text-white/80 font-bold text-shadow">
              バーコードをうつしてね
            </p>
          </div>
        </div>
      </div>

      {/* Footer Controls */}
      <div className="p-4 bg-white/80 backdrop-blur-sm pb-8 rounded-t-3xl shadow-[0_-5px_15px_rgba(0,0,0,0.05)]">
        <button
          onClick={handlePayment}
          className="w-full bg-green-500 hover:bg-green-600 text-white text-3xl font-bold py-6 px-6 rounded-2xl shadow-lg transform transition active:scale-95 flex items-center justify-center gap-3"
        >
          <Coins size={36} />
          お支払いへ
        </button>
      </div>
    </div>
  );
};

export default App;
