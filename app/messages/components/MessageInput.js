'use client';
import { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Image as ImageIcon, Paperclip, X, Loader2, File, CornerDownRight, Edit2 } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { useToast } from '@/context/ToastContext';

export default function MessageInput({ 
  chatId, 
  senderId, 
  onMessageSent, 
  initialPinnedItem, 
  editingMessage, 
  onCancelEdit,
  replyingToMessage,
  onCancelReply
}) {
  const [content, setContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [pinnedItem, setPinnedItem] = useState(initialPinnedItem || null);
  const fileInputRef = useRef(null);
  
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  useEffect(() => {
    if (editingMessage) {
      setContent(editingMessage.content || '');
    } else {
      setContent('');
    }
  }, [editingMessage]);

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const uploadFile = async (file) => {
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

    return {
      url: publicUrl,
      name: file.name,
      type: file.type
    };
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!content.trim() && !selectedFile && !pinnedItem) return;
    
    setIsSending(true);

    try {
      if (editingMessage) {
        // Edit mode
        const { error } = await supabase.from('messages').update({
          content: content.trim(),
          is_edited: true
        }).eq('id', editingMessage.id);

        if (error) throw error;
        onCancelEdit();
        setContent('');
      } else {
        // Send mode
        let attachment = null;
        if (selectedFile) {
          attachment = await uploadFile(selectedFile);
        }

        const isImage = attachment?.type?.startsWith('image/');

        const insertData = {
          chat_id: chatId,
          sender_id: senderId,
          content: content.trim(),
          image_url: isImage ? attachment.url : null,
          attachment_url: !isImage && attachment ? attachment.url : null,
          attachment_name: attachment ? attachment.name : null,
          attachment_type: attachment ? attachment.type : null,
          pinned_item_type: pinnedItem ? pinnedItem.type : 'none',
          pinned_item_id: pinnedItem ? pinnedItem.id : null,
          reply_to_id: replyingToMessage ? replyingToMessage.id : null
        };

        const { data: newMessage, error } = await supabase.from('messages')
          .insert(insertData)
          .select('id')
          .single();

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
        setSelectedFile(null);
        setPinnedItem(null);
        if (onCancelReply) onCancelReply();
        if (fileInputRef.current) fileInputRef.current.value = '';
        if (onMessageSent) onMessageSent();
      }
    } catch (err) {
      console.error('Send error:', err);
      toast.error('Failed to send message: ' + err.message);
    } finally {
      setIsSending(false);
    }
  };

  const isImageFile = selectedFile && selectedFile.type.startsWith('image/');

  return (
    <div className="bg-white border-t border-gray-100 p-3 md:p-4 shrink-0 flex flex-col">
      
      {/* Context Bar (Editing or Replying) */}
      {(editingMessage || replyingToMessage) && (
        <div className="flex items-center justify-between bg-gray-50 border-l-4 border-navy px-3 py-2 rounded-r-lg mb-3 shadow-sm">
          <div className="flex items-center gap-2 overflow-hidden">
            {editingMessage ? <Edit2 className="w-4 h-4 text-navy shrink-0" /> : <CornerDownRight className="w-4 h-4 text-navy shrink-0" />}
            <div className="truncate">
              <p className="text-xs font-bold text-navy">
                {editingMessage ? 'Editing Message' : `Replying to ${replyingToMessage.sender?.full_name || 'someone'}`}
              </p>
              <p className="text-[11px] text-gray-500 truncate">
                {(editingMessage?.content || replyingToMessage?.content || 'Attachment')}
              </p>
            </div>
          </div>
          <button 
            onClick={editingMessage ? onCancelEdit : onCancelReply}
            className="p-1 hover:bg-gray-200 rounded-full transition-colors text-gray-500 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Attachment Preview Area */}
      {(selectedFile || pinnedItem) && (
        <div className="flex gap-2 mb-3 overflow-x-auto pb-2">
          {selectedFile && (
            <div className="relative inline-block group">
              {isImageFile ? (
                <div className="w-16 h-16 rounded-lg bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center">
                  <img src={URL.createObjectURL(selectedFile)} alt="Preview" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="h-16 flex items-center gap-2 bg-gray-100 border border-gray-200 px-3 rounded-lg max-w-[200px]">
                  <File className="w-6 h-6 text-gray-500 shrink-0" />
                  <span className="text-xs font-bold text-gray-700 truncate">{selectedFile.name}</span>
                </div>
              )}
              <button 
                type="button" 
                onClick={() => setSelectedFile(null)}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          
          {pinnedItem && (
            <div className="relative inline-flex items-center gap-2 bg-indigo-50 border border-indigo-100 text-indigo-700 px-3 py-2 rounded-lg text-xs font-bold shadow-sm group">
              <Paperclip className="w-4 h-4 opacity-50 shrink-0" />
              <span className="truncate max-w-[200px]">Pinned: {pinnedItem.title || pinnedItem.id} ({pinnedItem.type})</span>
              <button 
                type="button" 
                onClick={() => setPinnedItem(null)}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSend} className="flex items-end gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={editingMessage} // Disable attachments when editing
          className="p-2.5 text-gray-400 hover:text-navy hover:bg-gray-50 rounded-xl transition-colors mb-0.5 shrink-0 disabled:opacity-30"
          title="Attach File"
        >
          <Paperclip className="w-5 h-5" />
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileSelect} 
            className="hidden" 
          />
        </button>

        <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-accent focus-within:border-accent transition-shadow flex items-center">
          <input
            type="text"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={editingMessage ? "Edit message..." : "Type a message..."}
            className="w-full bg-transparent px-4 py-3 text-sm font-medium text-gray-700 outline-none"
            disabled={isSending}
          />
        </div>

        <button
          type="submit"
          disabled={isSending || (!content.trim() && !selectedFile && !pinnedItem)}
          className="p-3 bg-navy text-white rounded-xl hover:bg-navy-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-0.5 shrink-0 shadow-sm"
        >
          {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
        </button>
      </form>
    </div>
  );
}
