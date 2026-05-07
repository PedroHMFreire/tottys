-- Bucket público para mídias do WhatsApp (imagens, áudios, vídeos, documentos)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('wa-media', 'wa-media', true, 67108864)
ON CONFLICT (id) DO NOTHING;
