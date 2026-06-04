import {
  Component, OnDestroy, Output, EventEmitter, ElementRef,
  ViewChild, ChangeDetectorRef, AfterViewInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

@Component({
  selector: 'app-barcode-scanner',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './barcode-scanner.component.html',
  styleUrl: './barcode-scanner.component.css'
})
export class BarcodeScannerComponent implements AfterViewInit, OnDestroy {
  @Output() barcodeScanned = new EventEmitter<string>();
  @ViewChild('manualInput') manualInputRef!: ElementRef<HTMLInputElement>;
  @ViewChild('readerContainer') readerContainerRef!: ElementRef<HTMLDivElement>;

  isScanning = false;
  isStarting = false;
  errorMessage = '';
  manualBarcode = '';
  lastScanned = '';
  scanStatus = ''; // live feedback during scanning

  private html5QrCode: Html5Qrcode | null = null;
  private readonly READER_ID = 'pos-qr-reader';
  private debounceTimer: any = null;
  private audioCtx: AudioContext | null = null;

  constructor(private cdr: ChangeDetectorRef) {}

  ngAfterViewInit(): void {
    // Pre-create the Html5Qrcode instance after the DOM is ready
  }

  // ─── Scan Beep ───────────────────────────────────────────────────────────
  /**
   * Plays a short confirmation beep using the Web Audio API.
   * No external sound file needed — works offline.
   * @param type 'success' (high beep) | 'error' (low double-beep)
   */
  private beep(type: 'success' | 'error' = 'success'): void {
    try {
      if (!this.audioCtx) {
        this.audioCtx = new AudioContext();
      }
      const ctx = this.audioCtx;

      const play = (freq: number, startAt: number, duration: number) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startAt);

        gain.gain.setValueAtTime(0.35, startAt);
        // Quick fade-out to avoid click artifacts
        gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);

        osc.start(startAt);
        osc.stop(startAt + duration + 0.01);
      };

      if (type === 'success') {
        // Single crisp beep at 880 Hz — like a real scanner gun
        play(880, ctx.currentTime, 0.12);
      } else {
        // Two low beeps for error
        play(330, ctx.currentTime,        0.10);
        play(260, ctx.currentTime + 0.15, 0.10);
      }
    } catch {
      // AudioContext not supported — fail silently
    }
  }

  async startScanner(): Promise<void> {
    if (this.isStarting || this.isScanning) return;
    this.isStarting = true;
    this.errorMessage = '';
    this.scanStatus = 'Initialising camera…';
    this.cdr.detectChanges();

    try {
      // Destroy any previous instance cleanly
      if (this.html5QrCode) {
        try { await this.html5QrCode.stop(); } catch (_) {}
        try { this.html5QrCode.clear(); } catch (_) {}
        this.html5QrCode = null;
      }

      // Give Angular a tick to render the reader div into the DOM
      await this.delay(100);

      this.html5QrCode = new Html5Qrcode(this.READER_ID, {
        // Support both 1-D barcodes and QR codes
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
        ],
        verbose: false,
        experimentalFeatures: { useBarCodeDetectorIfSupported: false },
      } as any);

      const containerWidth = this.readerContainerRef?.nativeElement?.offsetWidth || 400;
      const scanWidth = Math.min(containerWidth - 40, 380);
      const config = {
        fps: 8,
        // Wide, short box — correct aspect ratio for 1D barcodes (EAN-13, CODE-128, UPC)
        qrbox: { width: scanWidth, height: Math.round(scanWidth * 0.45) },
        aspectRatio: 1.7777778,
        disableFlip: false,
      };

      const onSuccess = (decodedText: string, _result: any) => {
        if (this.debounceTimer) return;
        this.debounceTimer = setTimeout(() => { this.debounceTimer = null; }, 1500);

        // ── Play scan confirmation beep ──
        this.beep('success');

        this.lastScanned = decodedText;
        this.scanStatus = `✅ Scanned: ${decodedText}`;
        this.barcodeScanned.emit(decodedText);
        this.cdr.detectChanges();
        setTimeout(() => { this.scanStatus = ''; this.cdr.detectChanges(); }, 2000);
      };

      const onError = (_errorMsg: string) => { /* suppress per-frame errors */ };

      try {
        // Try rear camera first (works on phones/tablets)
        await this.html5QrCode!.start(
          { facingMode: 'environment' },
          config,
          onSuccess,
          onError
        );
      } catch {
        // Rear camera not available (laptop/desktop) — let the browser pick
        await this.html5QrCode!.start(
          { facingMode: 'user' },
          config,
          onSuccess,
          onError
        );
      }

      this.isScanning = true;
      this.isStarting = false;
      this.scanStatus = 'Point camera at a barcode…';
      this.cdr.detectChanges();

      // Clear the "point camera" hint after 3s
      setTimeout(() => {
        if (this.isScanning && !this.lastScanned) {
          this.scanStatus = '';
          this.cdr.detectChanges();
        }
      }, 3000);

    } catch (err: any) {
      this.isStarting = false;
      this.isScanning = false;
      this.errorMessage = this.parseError(err);
      this.scanStatus = '';
      this.cdr.detectChanges();
    }
  }

  async stopScanner(): Promise<void> {
    if (this.html5QrCode) {
      try {
        if (this.isScanning) await this.html5QrCode.stop();
        this.html5QrCode.clear();
      } catch (_) {}
      this.html5QrCode = null;
    }
    clearTimeout(this.debounceTimer);
    this.debounceTimer = null;
    this.isScanning = false;
    this.isStarting = false;
    this.lastScanned = '';
    this.scanStatus = '';
    this.cdr.detectChanges();
  }

  submitManual(): void {
    const code = this.manualBarcode.trim();
    if (code) {
      this.beep('success'); // beep on manual entry too
      this.barcodeScanned.emit(code);
      this.manualBarcode = '';
    }
  }

  onManualKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') this.submitManual();
  }

  focusManualInput(): void {
    this.manualInputRef?.nativeElement?.focus();
  }

  private parseError(err: any): string {
    const msg: string = typeof err === 'string' ? err : (err?.message || '');
    if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('notallowed')) {
      return 'Camera permission denied. Please allow camera access and try again, or use manual barcode entry below.';
    }
    if (msg.toLowerCase().includes('notfound') || msg.toLowerCase().includes('no camera')) {
      return 'No camera found. Use the manual barcode input below.';
    }
    if (msg.toLowerCase().includes('notreadable') || msg.toLowerCase().includes('in use')) {
      return 'Camera is in use by another app. Close it and try again.';
    }
    if (msg.toLowerCase().includes('overconstrained')) {
      return 'Camera constraints not supported. Try again.';
    }
    return msg || 'Failed to start scanner. Use manual input below.';
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  ngOnDestroy(): void {
    this.stopScanner();
    // Clean up AudioContext to free browser resources
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
  }
}

