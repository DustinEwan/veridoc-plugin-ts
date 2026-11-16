Feature: project scan

  @id:config/rejects-missing-config
  Scenario: A missing project root is refused
    Given the empty-directory fixture
    When parse-config runs against that directory
