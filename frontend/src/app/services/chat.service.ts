import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ChatService {
  private webhookUrl = environment.n8nWebhookUrl;

  constructor(private http: HttpClient) {}

  sendMessage(message: string, sessionId: string): Observable<any> {
    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    const payload = { chatInput: message, sessionId };

    console.log('🔍 Sending to:', this.webhookUrl);
    console.log('📤 Payload:', payload);

    return this.http.post(this.webhookUrl, payload, { headers });
  }
}
