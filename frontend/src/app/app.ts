import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, CommonModule, HttpClientModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('frontend');

  results: any[] = [];
  coords: GeolocationCoordinates | null = null;
  nearest: Record<number, any> = {};
  
  // Chatbot properties
  isChatOpen = false;
  chatMessages: any[] = [];
  userMessage = '';

  constructor(private http: HttpClient) {}

  search(q: string) {
    if (!q) return;
    this.http
      .get<{ items: any[] }>(`/api/searchProduct`, { params: { q } })
      .subscribe((res) => {
        this.results = res.items || [];
      });
  }

  locate() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      this.coords = pos.coords;
    });
  }

  findNearest(productId: number) {
    const lat = this.coords?.latitude ?? 41.0082; // default Istanbul
    const lng = this.coords?.longitude ?? 28.9784;
    this.http
      .get<{ items: any[] }>(`/api/nearestStore`, { params: { lat, lng, productId } as any })
      .subscribe((res) => {
        this.nearest[productId] = res.items?.[0];
      });
  }

  // Chatbot methods
  toggleChat() {
    this.isChatOpen = !this.isChatOpen;
    if (this.isChatOpen) {
      this.addBotMessage('Merhaba! Size yemek tariflerinde yardımcı olabilirim. Hangi tarifi öğrenmek istiyorsunuz?');
    }
  }
  
  addBotMessage(text: string) {
    this.chatMessages.push({
      type: 'bot',
      text,
      time: new Date()
    });
    this.scrollToBottom();
  }
  
  addUserMessage(text: string) {
    this.chatMessages.push({
      type: 'user',
      text,
      time: new Date()
    });
  }
  
  async sendMessage() {
    if (!this.userMessage.trim()) return;
    
    const message = this.userMessage;
    this.addUserMessage(message);
    this.userMessage = '';
    
    try {
      const response: any = await this.http.post('/api/chatbot', {
        message,
        userId: 'user-' + Date.now()
      }).toPromise();
      
      if (response && response.recipe) {
        this.addBotMessage(response.message);
        // Eğer ürünler varsa göster
        if (response.available_products?.length > 0) {
          this.addBotMessage(`Bulunan ürünler: ${response.available_products.map((p: any) => p.name).join(', ')}`);
        }
      } else {
        this.addBotMessage('Üzgünüm, şu anda tarif bulamadım. Lütfen tekrar deneyin.');
      }
    } catch (error) {
      this.addBotMessage('Bir hata oluştu. Lütfen tekrar deneyin.');
    }
  }
  
  scrollToBottom() {
    setTimeout(() => {
      const container = document.querySelector('.chat-messages');
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }, 100);
  }
}
