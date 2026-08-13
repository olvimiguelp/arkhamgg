-- Add ticket_pdf_url column to repairs table to store the PDF URL
ALTER TABLE repairs ADD COLUMN IF NOT EXISTS ticket_pdf_url TEXT;
