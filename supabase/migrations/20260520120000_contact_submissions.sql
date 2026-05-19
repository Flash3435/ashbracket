-- Public Contact Us form: store submissions for reference (writes via service role only).

CREATE TABLE public.contact_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL,
  email text NOT NULL,
  topic text NOT NULL,
  role text,
  pool_context text,
  message text NOT NULL,
  source_page text NOT NULL DEFAULT '/contact',
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

CREATE INDEX idx_contact_submissions_email_created
  ON public.contact_submissions (email, created_at DESC);

CREATE INDEX idx_contact_submissions_created_desc
  ON public.contact_submissions (created_at DESC);

COMMENT ON TABLE public.contact_submissions IS
  'AshBracket Contact Us form submissions; inserted server-side with service role.';

ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;

-- No policies: authenticated users cannot read/write directly; service role bypasses RLS.
