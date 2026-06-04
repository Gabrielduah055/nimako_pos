import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, throwError, catchError, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { User } from '../models/cart-item.model';

// Matches exactly what the backend returns at POST /api/auth/login
interface BackendLoginResponse {
  success: boolean;
  message: string;
  data: {
    token: string;
    user: {
      id: string;
      name: string;
      email: string;
      role: 'cashier' | 'admin';
    };
  };
}

// Normalised shape stored in localStorage and used throughout the app
export interface StoredUser {
  _id: string;
  name: string;
  email: string;
  role: 'cashier' | 'admin';
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly TOKEN_KEY = 'pos_token';
  private readonly USER_KEY = 'pos_user';
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient, private router: Router) {}

  login(email: string, password: string): Observable<StoredUser> {
    return this.http
      .post<BackendLoginResponse>(`${this.apiUrl}/auth/login`, { email, password })
      .pipe(
        map((res: BackendLoginResponse) => {
          if (!res.success || !res.data) {
            throw new Error(res.message || 'Login failed.');
          }
          const { token, user } = res.data;
          // Normalise: backend sends 'id', we store as '_id' for consistency
          const storedUser: StoredUser = {
            _id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
          };
          localStorage.setItem(this.TOKEN_KEY, token);
          localStorage.setItem(this.USER_KEY, JSON.stringify(storedUser));
          return storedUser;
        }),
        catchError(err => throwError(() => err))
      );
  }

  logout(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  getUser(): StoredUser | null {
    const u = localStorage.getItem(this.USER_KEY);
    return u ? JSON.parse(u) : null;
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  isCashier(): boolean {
    const user = this.getUser();
    return user?.role === 'cashier' || user?.role === 'admin';
  }

  getCurrentUser(): Observable<User> {
    return this.http.get<any>(`${this.apiUrl}/auth/me`).pipe(
      map(res => res?.data || res)
    );
  }
}
