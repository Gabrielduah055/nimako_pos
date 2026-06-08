import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {
  email = '';
  password = '';
  isLoading = false;
  errorMessage = '';
  showPassword = false;
  isOnline = navigator.onLine;

  constructor(private authService: AuthService, private router: Router) {
    // Redirect if already logged in
    if (this.authService.isLoggedIn()) {
      this.router.navigate(['/pos']);
    }
  }

  login(): void {
    if (!this.email.trim() || !this.password.trim()) {
      this.errorMessage = this.isOnline
        ? 'Please enter your email and password.'
        : 'Please enter your email and local offline PIN.';
      return;
    }
    this.isLoading = true;
    this.errorMessage = '';

    this.authService.login(this.email.trim(), this.password).subscribe({
      next: (_user) => {
        this.isLoading = false;
        this.router.navigate(['/pos']);
      },
      error: (err: any) => {
        this.isLoading = false;
        // Handle backend's wrapped error: { success: false, message: '...' }
        const backendMsg = err?.error?.message;
        if (backendMsg) {
          this.errorMessage = backendMsg;
        } else if (err?.status === 401) {
          this.errorMessage = 'Invalid email or password.';
        } else if (err?.status === 403) {
          this.errorMessage = 'Your account is deactivated. Contact an administrator.';
        } else if (err?.message) {
          this.errorMessage = err.message;
        } else {
          this.errorMessage = 'Login failed. Please check your connection and try again.';
        }
      }
    });
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.login();
    }
  }

  @HostListener('window:online')
  onOnline(): void {
    this.isOnline = true;
  }

  @HostListener('window:offline')
  onOffline(): void {
    this.isOnline = false;
  }
}
