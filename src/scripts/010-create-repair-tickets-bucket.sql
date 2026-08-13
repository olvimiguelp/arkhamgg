-- Create storage bucket for repair tickets
INSERT INTO storage.buckets (id, name, public)
VALUES ('repair-tickets', 'repair-tickets', true)
ON CONFLICT (id) DO NOTHING;

-- Set up storage policies for repair tickets
CREATE POLICY "Allow public read access to repair tickets"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'repair-tickets');

CREATE POLICY "Allow authenticated users to upload repair tickets"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'repair-tickets');

CREATE POLICY "Allow authenticated users to update repair tickets"
ON storage.objects FOR UPDATE
TO public
USING (bucket_id = 'repair-tickets');

CREATE POLICY "Allow authenticated users to delete repair tickets"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'repair-tickets');
