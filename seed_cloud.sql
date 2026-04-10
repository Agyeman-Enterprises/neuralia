INSERT INTO organism.products (id, name, class, niche, medium_pub, target_keywords, target_subreddits, description) VALUES
('scribemdpro', 'ScribeMD Pro', 'medical', 'AI medical documentation and clinical scribe software', 'dramd', '{"clinical documentation", "charting", "soap notes", "scribe", "ehr"}', '{"medicine", "doctors", "residency", "familypractice"}', 'AI-powered scribe for physicians to reduce documentation burnout.'),
('taxrx', 'TaxRx', 'professional', 'AI tax strategy for healthcare professionals', 'taxrx', '{"tax strategy", "accounting", "irs", "physician finances"}', '{"finance", "whitecoatinvestor", "medicine"}', 'Automated tax planning for high-income medical professionals.'),
('linahla', 'Linahla', 'medical', 'Telehealth for maternal and child health in Pacific regions', 'linahla', '{"maternal health", "telehealth", "guam", "pacific health"}', '{"guam", "parenting", "health"}', 'Virtual care platform for mothers and families.')
ON CONFLICT (id) DO NOTHING;
