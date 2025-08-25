import config from './config';

// Example of how to use the configuration in your Angular components/services

export class ChatService {
  async sendMessage(message: string, sessionId: string) {
    try {
      const response = await fetch(config.chatEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          sessionId
        })
      });
      
      return await response.json();
    } catch (error) {
      console.error('Chat error:', error);
      throw error;
    }
  }
}

// Example component usage:
export class ChatComponent {
  private chatService = new ChatService();
  
  async onSendMessage(message: string) {
    try {
      const sessionId = 'user-session-' + Date.now();
      const result = await this.chatService.sendMessage(message, sessionId);
      console.log('Chat response:', result);
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  }
}
