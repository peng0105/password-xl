"""Regression coverage for corrupted Jenkins XML and a non-destructive UI migration."""
import copy
from pathlib import Path
import re
import sys
import unittest
from xml.etree import ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'jenkins'))
import migrate_chinese_parameters as migration


class JenkinsEncoding(unittest.TestCase):
    def config(self):
        xml = ET.fromstring('''<flow-definition><description/><properties>
          <hudson.model.ParametersDefinitionProperty><parameterDefinitions>
          <hudson.model.StringParameterDefinition><name>VERSION</name><description/>
          <defaultValue>1.5.2</defaultValue><trim>true</trim></hudson.model.StringParameterDefinition>
          <hudson.model.BooleanParameterDefinition><name>DEPLOY_OSS</name><description/>
          <defaultValue>false</defaultValue></hudson.model.BooleanParameterDefinition>
          </parameterDefinitions></hudson.model.ParametersDefinitionProperty></properties>
          <definition class="CpsScmFlowDefinition"><scriptPath>Jenkinsfile</scriptPath>
          <scm><branch>*/master</branch><credentialsId>fixture</credentialsId></scm></definition>
          <disabled>false</disabled></flow-definition>''')
        for desc in xml.iter('description'):
            text = '中文说明：构建与发布'
            for _ in range(5):
                text = text.encode('utf8').decode('latin1')
            desc.text = text
        return xml

    def test_migration_preserves_defaults_and_scm_and_is_repeatable(self):
        config = self.config()
        before = copy.deepcopy(config)
        migration.migrate(config)
        self.assertEqual(config.findtext('description'), '中文说明：构建与发布')
        self.assertEqual([p.text for p in config.findall('.//parameterDefinitions/*/name')], ['构建版本', '发布OSS'])
        self.assertEqual([p.text for p in config.findall('.//defaultValue')], ['1.5.2', 'false'])
        self.assertEqual(ET.tostring(config.find('definition')), ET.tostring(before.find('definition')))
        first = migration.xml_payload(config)
        self.assertEqual(migration.xml_payload(migration.migrate(config)), first)

    def test_safe_xml_survives_latin1_servlet_reader(self):
        config = migration.migrate(self.config())
        payload = migration.xml_payload(config)
        # Reproduces the reader used by Jenkins config.xml without a request charset.
        parsed = ET.fromstring(payload.decode('latin1'))
        self.assertEqual(parsed.findtext('description'), '中文说明：构建与发布')
        self.assertEqual(parsed.findtext('.//parameterDefinitions/*/name'), '构建版本')

    def test_does_not_guess_at_other_text(self):
        for value in (None, '', 'Password XL', 'café', '发布 OSS', '不可逆的�文字'):
            self.assertEqual(migration.repair_text(value), value)

    def test_duplicate_parameters_fail_instead_of_resetting_values(self):
        config = self.config()
        definitions = config.find('.//parameterDefinitions')
        duplicate = copy.deepcopy(definitions[0])
        duplicate.find('name').text = '构建版本'
        definitions.append(duplicate)
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            migration.migrate(config)

    def test_pipeline_and_migration_use_same_public_parameter_names(self):
        source = (Path(__file__).resolve().parents[1] / 'jenkins/release.groovy').read_text(encoding='utf8')
        body = source.split('def parameterNames()', 1)[1].split('}', 1)[0]
        self.assertEqual(dict(re.findall(r"([A-Z_]+): '([^']+)'", body)), migration.NAMES)


if __name__ == '__main__':
    unittest.main()
