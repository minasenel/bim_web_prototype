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
      const response: any = await this.http.post('/api/chatbot-simple', {
        message,
        userId: 'user-' + Date.now()
      }).toPromise();
      
      if (response && response.content && response.content.parts && response.content.parts[0]) {
        // n8n'den gelen AI yanıtını parse et
        const aiText = response.content.parts[0].text;
        
        // JSON formatında yanıt varsa onu kullan
        try {
          const jsonMatch = aiText.match(/```json\n([\s\S]*?)\n```/);
          if (jsonMatch) {
            const recipeData = JSON.parse(jsonMatch[1]);
            const botMessage = `${recipeData.recipe}\n\nMalzemeler: ${recipeData.ingredients.join(', ')}\n\nPişirme Süresi: ${recipeData.cooking_time}\nZorluk: ${recipeData.difficulty}\n\nYapılışı:\n${recipeData.instructions}`;
            this.addBotMessage(botMessage);
          } else {
            this.addBotMessage(aiText);
          }
        } catch (parseError) {
          this.addBotMessage(aiText);
        }
      } else if (response && response.recipe) {
        // Fallback response'dan gelen veri
        const botMessage = `${response.recipe}\n\nMalzemeler: ${response.ingredients.join(', ')}\n\nPişirme Süresi: ${response.cooking_time}\nZorluk: ${response.difficulty}\n\nYapılışı:\n${response.instructions}`;
        this.addBotMessage(botMessage);
      } else {
        this.addBotMessage('Üzgünüm, şu anda tarif bulamadım. Lütfen tekrar deneyin.');
      }
    } catch (error) {
      console.error('Chatbot error:', error);
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
