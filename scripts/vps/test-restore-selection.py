"""Regresiones del alcance de restauración, sin Docker, credenciales ni datos."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('restore', Path(__file__).with_name('restore-persistent-catalog.py'))
restore = importlib.util.module_from_spec(spec)
spec.loader.exec_module(restore)


class RestoreSelectionTests(unittest.TestCase):
    def test_namespaces_acl_and_extension_identifiers(self):
        entries = [
            '1; 2615 10 SCHEMA - auth supabase_admin',
            '2; 0 0 ACL - SCHEMA auth supabase_admin',
            '3; 0 0 DEFAULT ACL public DEFAULT PRIVILEGES FOR TABLES postgres',
            '4; 3079 12 EXTENSION - uuid-ossp ',
            '5; 0 0 COMMENT - EXTENSION "uuid-ossp" ',
            '6; 0 0 ACL public FUNCTION gtrgm_in(cstring) supabase_admin',
            '7; 0 0 FK CONSTRAINT public favorites favorites_product_id_fkey postgres',
            '8; 0 0 POLICY public profiles own_profile postgres',
        ]
        selected, public_schema = restore.select_restore_entries(entries)
        self.assertEqual(selected, entries)
        self.assertFalse(public_schema)

    def test_provider_internals_are_excluded_and_unknowns_fail_closed(self):
        entries = [
            '1; 2615 10 SCHEMA - storage supabase_admin',
            '2; 0 0 TABLE DATA storage objects supabase_storage_admin',
            '3; 0 0 ACL pg_catalog FUNCTION pg_reload_conf() supabase_admin',
            '4; 3079 12 EXTENSION - supabase_vault ',
            '5; 0 0 EVENT TRIGGER - provider_trigger supabase_admin',
            '6; 0 0 TABLE DATA public products postgres',
        ]
        self.assertEqual(restore.select_restore_entries(entries)[0], [entries[-1]])
        with self.assertRaisesRegex(RuntimeError, 'CATALOG_TOC_UNKNOWN'):
            restore.select_restore_entries(['7; 0 0 UNKNOWN new_namespace unexpected postgres'])


if __name__ == '__main__':
    unittest.main()
