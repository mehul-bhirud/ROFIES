revoke truncate, references, trigger on table
  public.college_id_documents,
  public.institution_domains,
  public.item_photos,
  public.member_applications
from anon, authenticated;
