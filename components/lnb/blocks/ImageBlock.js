import React, { useState, useRef } from 'react';
import { Image as ImageIcon, Upload, X, Loader2 } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

export default function ImageBlock({ block, updateBlock, canEdit }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);
  
  const supabase = createClient();
  const url = block.content?.url || '';
  const caption = block.content?.caption || '';

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `lnb_image_${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('lab-notebook-files')
        .upload(fileName, file, { cacheControl: '3600', upsert: false });

      if (uploadError) throw new Error(uploadError.message);

      const { data: { publicUrl } } = supabase.storage
        .from('lab-notebook-files')
        .getPublicUrl(uploadData.path);

      updateBlock(block.id, { content: { ...block.content, url: publicUrl } });
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const clearImage = () => {
    updateBlock(block.id, { content: { ...block.content, url: '' } });
  };

  const updateCaption = (e) => {
    updateBlock(block.id, { content: { ...block.content, caption: e.target.value } });
  };

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 mb-2 px-1">
        <ImageIcon className="w-4 h-4 text-gray-400" />
        <span className="text-xs font-bold text-gray-500 uppercase">Image Block</span>
      </div>
      
      <div className="border border-gray-200 rounded-xl bg-white shadow-sm overflow-hidden p-4">
        {url ? (
          <div className="relative group">
            <img src={url} alt="Notebook Block" className="w-full max-w-2xl rounded-lg mx-auto border border-gray-100" />
            
            {canEdit && (
              <button 
                onClick={clearImage}
                className="absolute top-2 right-2 p-1.5 bg-red-500/90 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            
            <div className="mt-3 max-w-2xl mx-auto">
              {canEdit ? (
                <input
                  type="text"
                  value={caption}
                  onChange={updateCaption}
                  placeholder="Add a caption..."
                  className="w-full text-center text-xs text-gray-500 bg-transparent border-b border-transparent hover:border-gray-200 focus:border-navy outline-none py-1 transition-colors"
                />
              ) : (
                caption && <p className="text-center text-xs text-gray-500 italic mt-2">{caption}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8">
            {canEdit ? (
              <>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/png, image/jpeg, image/gif"
                  onChange={handleUpload}
                />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-50 text-gray-600 rounded-lg border border-dashed border-gray-300 font-bold text-xs hover:bg-gray-100 hover:text-navy transition-colors disabled:opacity-50"
                >
                  {uploading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</>
                  ) : (
                    <><Upload className="w-4 h-4" /> Click to upload image</>
                  )}
                </button>
                {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
              </>
            ) : (
              <span className="text-gray-400 italic text-sm">No image uploaded.</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
