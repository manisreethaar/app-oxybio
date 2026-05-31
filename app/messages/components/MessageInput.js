import { useState, useRef } from 'react';
import { Send, Image as ImageIcon, Paperclip, X, Loader2 } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { useToast } from '@/context/ToastContext';

export default function MessageInput({ chatId, senderId, onMessageSent, initialPinnedItem }) {
  const [content, setContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [pinnedItem, setPinnedItem] = useState(initialPinnedItem || null);
  const fileInputRef = useRef(null);
  
  const supabase = createClient();
  const toast = useToast();

  const handleImageSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedImage(e.target.files[0]);
    }
  };

  const uploadImage = async (file) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random()}.${fileExt}`;
    const filePath = `${chatId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('chat-attachments')
      .upload(filePath, file);

    if (uploadError) {
      throw uploadError;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('chat-attachments')
      .getPublicUrl(filePath);

    return publicUrl;
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!content.trim() && !selectedImage && !pinnedItem) return;
    
    setIsSending(true);
    let imageUrl = null;

    try {
      if (selectedImage) {
        imageUrl = await uploadImage(selectedImage);
      }

      // We handle mentions in backend or client. 
      // For now, simple text parsing for mentions could be done, but let's keep it simple: just content.
      
      const { data: newMessage, error } = await supabase.from('messages').insert({
        chat_id: chatId,
        sender_id: senderId,
        content: content.trim(),
        image_url: imageUrl,
        pinned_item_type: pinnedItem ? pinnedItem.type : 'none',
        pinned_item_id: pinnedItem ? pinnedItem.id : null,
      }).select('id').single();

      if (error) throw error;

      // Trigger push notifications
      if (newMessage && newMessage.id) {
        fetch('/api/messages/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId: newMessage.id })
        }).catch(err => console.error('Failed to trigger push notifications:', err));
      }

      setContent('');
      setSelectedImage(null);
      setPinnedItem(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (onMessageSent) onMessageSent();
      
    } catch (err) {
      console.error('Send error:', err);
      toast.error('Failed to send message: ' + err.message);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="bg-white border-t border-gray-100 p-3 md:p-4 shrink-0">
      {/* Attachment Preview Area */}
      {(selectedImage || pinnedItem) && (
        <div className="flex gap-2 mb-3 overflow-x-auto pb-2">
          {selectedImage && (
            <div className="relative inline-block">
              <div className="w-16 h-16 rounded-lg bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center">
                <img src={URL.createObjectURL(selectedImage)} alt="Preview" className="w-full h-full object-cover" />
              </div>
              <button 
                type="button" 
                onClick={() => setSelectedImage(null)}
                className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 shadow-sm"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          
          {pinnedItem && (
            <div className="relative inline-flex items-center gap-2 bg-indigo-50 border border-indigo-100 text-indigo-700 px-3 py-2 rounded-lg text-xs font-bold shadow-sm">
              <Paperclip className="w-4 h-4 opacity-50" />
              <span>Pinned: {pinnedItem.title || pinnedItem.id} ({pinnedItem.type})</span>
              <button 
                type="button" 
                onClick={() => setPinnedItem(null)}
                className="ml-2 hover:bg-indigo-100 p-0.5 rounded transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSend} className="flex items-end gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="p-2.5 text-gray-400 hover:text-navy hover:bg-gray-50 rounded-xl transition-colors mb-0.5 shrink-0"
          title="Upload Image"
        >
          <ImageIcon className="w-5 h-5" />
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleImageSelect} 
            accept="image/*" 
            className="hidden" 
          />
        </button>

        <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-accent focus-within:border-accent transition-shadow flex items-center">
          <input
            type="text"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Type a message..."
            className="w-full bg-transparent px-4 py-3 text-sm font-medium text-gray-700 outline-none"
            disabled={isSending}
          />
        </div>

        <button
          type="submit"
          disabled={isSending || (!content.trim() && !selectedImage && !pinnedItem)}
          className="p-3 bg-navy text-white rounded-xl hover:bg-navy-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-0.5 shrink-0 shadow-sm"
        >
          {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
        </button>
      </form>
    </div>
  );
}
