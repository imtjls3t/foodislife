ALTER TABLE recipe_notes
  ADD COLUMN attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE POLICY "Users update own recipe notes" ON recipe_notes
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM recipes
      WHERE recipes.id = recipe_notes.recipe_id
      AND recipes.user_id = auth.uid()
    )
  );

CREATE TRIGGER recipe_notes_set_updated_at
  BEFORE UPDATE ON recipe_notes
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'recipe-note-photos',
  'recipe-note-photos',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "Users upload own recipe note photos" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'recipe-note-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users read own recipe note photos" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'recipe-note-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users delete own recipe note photos" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'recipe-note-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
