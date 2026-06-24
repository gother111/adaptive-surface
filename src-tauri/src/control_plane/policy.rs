use super::contracts::*;
use super::data_guard::{evaluate_egress, metadata_contains_secret};

pub fn evaluate_operation(
    config: &SafetyConfig,
    graph: &TaskGraph,
    operation: &WorkUnit,
    capability: Option<&SemanticCapabilityDescriptor>,
) -> PolicyDecision {
    let mut reason_codes = Vec::new();
    let Some(capability) = capability else {
        return deny(
            vec![PolicyReasonCode::UnknownCapability],
            "Capability is not declared in the semantic registry.",
            CommitmentTier::Observe,
            DataEgressDisposition::Deny,
            false,
        );
    };

    if graph.work_units.len() > config.max_operations {
        reason_codes.push(PolicyReasonCode::OperationLimitExceeded);
    }

    if operation.capability_id != capability.capability_id {
        reason_codes.push(PolicyReasonCode::CapabilityMismatch);
    }

    if capability.availability != CapabilityAvailability::Available {
        reason_codes.push(PolicyReasonCode::CapabilityUnavailable);
    }

    if capability
        .required_permissions
        .iter()
        .any(|permission| permission.eq_ignore_ascii_case("unknown") || permission.eq_ignore_ascii_case("unavailable"))
    {
        reason_codes.push(PolicyReasonCode::RequiredPermissionUnavailable);
    }

    if operation
        .input
        .get("limit")
        .and_then(|value| value.parse::<usize>().ok())
        .is_some_and(|limit| limit > 50)
    {
        reason_codes.push(PolicyReasonCode::OperationOutsideScope);
    }

    if !risk_matches_side_effect(&capability.risk_class, &capability.side_effect_class) {
        reason_codes.push(PolicyReasonCode::RiskSideEffectMismatch);
    }

    let authority = instruction_authority(operation);
    if matches!(authority, InstructionAuthority::ExternalContent)
        && !matches!(capability.risk_class, SemanticRiskClass::SafeRead)
    {
        reason_codes.push(PolicyReasonCode::ExternalContentNoAuthority);
    }

    if !config.context_revision_current
        && matches!(
            capability.side_effect_class,
            SideEffectClass::ExternalConsequential | SideEffectClass::Destructive | SideEffectClass::Unknown
        )
    {
        reason_codes.push(PolicyReasonCode::StaleContext);
    }

    if requires_target_binding(capability) && operation_target(operation).is_none() {
        reason_codes.push(PolicyReasonCode::MissingTargetBinding);
    }

    let sensitivity = data_sensitivity(operation);
    let destination = destination_class(operation, capability);
    let contains_secret = metadata_contains_secret(&operation.input);
    let data_egress = evaluate_egress(&sensitivity, &destination, contains_secret);

    match data_egress {
        DataEgressDisposition::Deny => reason_codes.push(PolicyReasonCode::DataEgressDenied),
        DataEgressDisposition::RequireApproval => {}
        DataEgressDisposition::Allow => {}
    }

    if !reason_codes.is_empty() {
        let replanning_required = reason_codes
            .iter()
            .any(|code| matches!(code, PolicyReasonCode::StaleContext | PolicyReasonCode::OperationOutsideScope));
        return deny(
            reason_codes,
            "Policy denied execution before dispatch.",
            CommitmentTier::Observe,
            data_egress,
            replanning_required,
        );
    }

    match (&capability.risk_class, &capability.side_effect_class) {
        (SemanticRiskClass::SafeRead, SideEffectClass::None) => allow(
            PolicyReasonCode::SafeReadAllowed,
            "Safe read may run through the typed capability executor.",
            CommitmentTier::Observe,
            data_egress,
        ),
        (SemanticRiskClass::LocalWrite, SideEffectClass::LocalReversible) => allow(
            PolicyReasonCode::LocalPreparationAllowed,
            "Local reversible preparation may run inside Adaptive Surface.",
            CommitmentTier::Prepare,
            data_egress,
        ),
        (SemanticRiskClass::ExternalWrite, SideEffectClass::ExternalConsequential) => {
            match config.mode {
                SafetyMode::Shadow => deny(
                    vec![PolicyReasonCode::ShadowExternalWritePreviewOnly],
                    "Shadow mode may prepare a proposal but must not dispatch an external write.",
                    CommitmentTier::Propose,
                    data_egress,
                    false,
                ),
                SafetyMode::Confirm => PolicyDecision {
                    disposition: PolicyDisposition::RequireApproval,
                    reason_codes: vec![PolicyReasonCode::ExternalWriteRequiresApproval],
                    explanation: "Confirm mode requires one-time approval for this external write.".to_string(),
                    effective_commitment_ceiling: CommitmentTier::Propose,
                    approval_required: true,
                    data_egress,
                    replanning_required: false,
                },
            }
        }
        (SemanticRiskClass::Destructive, _) | (_, SideEffectClass::Destructive) => deny(
            vec![PolicyReasonCode::DestructiveDenied],
            "Destructive operations are denied for this personal-use milestone.",
            CommitmentTier::Observe,
            data_egress,
            false,
        ),
        _ => deny(
            vec![PolicyReasonCode::UnknownSideEffectDenied],
            "Unknown or unsupported side effects fail closed.",
            CommitmentTier::Observe,
            data_egress,
            false,
        ),
    }
}

fn allow(
    reason_code: PolicyReasonCode,
    explanation: &str,
    ceiling: CommitmentTier,
    data_egress: DataEgressDisposition,
) -> PolicyDecision {
    PolicyDecision {
        disposition: PolicyDisposition::Allow,
        reason_codes: vec![reason_code],
        explanation: explanation.to_string(),
        effective_commitment_ceiling: ceiling,
        approval_required: false,
        data_egress,
        replanning_required: false,
    }
}

fn deny(
    reason_codes: Vec<PolicyReasonCode>,
    explanation: &str,
    ceiling: CommitmentTier,
    data_egress: DataEgressDisposition,
    replanning_required: bool,
) -> PolicyDecision {
    PolicyDecision {
        disposition: PolicyDisposition::Deny,
        reason_codes,
        explanation: explanation.to_string(),
        effective_commitment_ceiling: ceiling,
        approval_required: false,
        data_egress,
        replanning_required,
    }
}

fn risk_matches_side_effect(risk: &SemanticRiskClass, side_effect: &SideEffectClass) -> bool {
    matches!(
        (risk, side_effect),
        (SemanticRiskClass::SafeRead, SideEffectClass::None)
            | (SemanticRiskClass::LocalWrite, SideEffectClass::LocalReversible)
            | (SemanticRiskClass::ExternalWrite, SideEffectClass::ExternalConsequential)
            | (SemanticRiskClass::Destructive, SideEffectClass::Destructive)
    )
}

fn instruction_authority(operation: &WorkUnit) -> InstructionAuthority {
    match operation.input.get("instructionAuthority").map(String::as_str) {
        Some("system_policy") => InstructionAuthority::SystemPolicy,
        Some("external_content") => InstructionAuthority::ExternalContent,
        Some("derived_data") => InstructionAuthority::DerivedData,
        _ => InstructionAuthority::UserDirective,
    }
}

fn data_sensitivity(operation: &WorkUnit) -> Sensitivity {
    match operation.input.get("dataSensitivity").map(String::as_str) {
        Some("sensitive") => Sensitivity::Sensitive,
        Some("restricted") => Sensitivity::Restricted,
        Some("external_shareable") => Sensitivity::ExternalShareable,
        _ => Sensitivity::Local,
    }
}

fn destination_class(
    operation: &WorkUnit,
    capability: &SemanticCapabilityDescriptor,
) -> DestinationClass {
    match operation.input.get("destination").map(String::as_str) {
        Some("local_provider") => DestinationClass::LocalProvider,
        Some("cloud_model") => DestinationClass::CloudModel,
        Some("external_connector") => DestinationClass::ExternalConnector,
        Some("native_application") => DestinationClass::NativeApplication,
        Some("diagnostic_log") => DestinationClass::DiagnosticLog,
        Some("local_process") => DestinationClass::LocalProcess,
        _ if matches!(capability.risk_class, SemanticRiskClass::ExternalWrite) => {
            DestinationClass::ExternalConnector
        }
        _ => DestinationClass::LocalProcess,
    }
}

fn requires_target_binding(capability: &SemanticCapabilityDescriptor) -> bool {
    matches!(
        capability.side_effect_class,
        SideEffectClass::ExternalConsequential | SideEffectClass::Destructive
    )
}

fn operation_target(operation: &WorkUnit) -> Option<&str> {
    operation
        .input
        .get("target")
        .or_else(|| operation.input.get("recipient"))
        .or_else(|| operation.input.get("objectReference"))
        .map(String::as_str)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn capability(
        id: &str,
        risk_class: SemanticRiskClass,
        side_effect_class: SideEffectClass,
    ) -> SemanticCapabilityDescriptor {
        SemanticCapabilityDescriptor {
            capability_id: id.to_string(),
            provider_binding: "test-provider".to_string(),
            input_contract: "test.input.v1".to_string(),
            output_contract: "test.output.v1".to_string(),
            operation_kind: match risk_class {
                SemanticRiskClass::SafeRead => OperationKind::Read,
                SemanticRiskClass::LocalWrite => OperationKind::PrepareDraft,
                _ => OperationKind::MutateExternal,
            },
            read_or_write: if matches!(risk_class, SemanticRiskClass::SafeRead) {
                ReadOrWrite::Read
            } else {
                ReadOrWrite::Write
            },
            availability: CapabilityAvailability::Available,
            risk_class,
            approval_requirement: ApprovalRequirement::None,
            timeout_ms: 100,
            supports_cancellation: true,
            idempotency_semantics: "test".to_string(),
            side_effect_class,
            reversibility: "test".to_string(),
            required_permissions: Vec::new(),
        }
    }

    fn unit(id: &str, capability_id: &str) -> WorkUnit {
        WorkUnit {
            work_unit_id: WorkUnitId::new(id),
            kind: WorkUnitKind::PureSynthesis,
            capability_id: capability_id.to_string(),
            title: id.to_string(),
            dependencies: Vec::new(),
            join_policy: JoinPolicy::AllSucceeded,
            execution_policy: ExecutionPolicy {
                timeout_ms: 100,
                approval_requirement: ApprovalRequirement::None,
                side_effect_class: SideEffectClass::None,
                retry_policy: RetryPolicy {
                    max_attempts: 1,
                    retry_idempotent_only: true,
                },
                idempotency_key: Some(id.to_string()),
                supports_cancellation: true,
            },
            input: Metadata::new(),
            state: OperationState::Planned,
        }
    }

    fn graph(units: Vec<WorkUnit>) -> TaskGraph {
        TaskGraph {
            graph_id: TaskGraphId::new("graph-1"),
            session_id: SessionId::new("session-1"),
            objective_id: ObjectiveId::new("objective-1"),
            plan_revision: 1,
            work_units: units,
            created_at_ms: 1,
        }
    }

    #[test]
    fn safe_read_is_allowed() {
        let unit = unit("read", "read.capability");
        let decision = evaluate_operation(
            &SafetyConfig::default(),
            &graph(vec![unit.clone()]),
            &unit,
            Some(&capability(
                "read.capability",
                SemanticRiskClass::SafeRead,
                SideEffectClass::None,
            )),
        );

        assert_eq!(decision.disposition, PolicyDisposition::Allow);
        assert!(decision
            .reason_codes
            .contains(&PolicyReasonCode::SafeReadAllowed));
    }

    #[test]
    fn local_preparation_is_allowed_and_stays_local() {
        let mut unit = unit("prepare", "prepare.capability");
        unit.execution_policy.side_effect_class = SideEffectClass::LocalReversible;
        let decision = evaluate_operation(
            &SafetyConfig::default(),
            &graph(vec![unit.clone()]),
            &unit,
            Some(&capability(
                "prepare.capability",
                SemanticRiskClass::LocalWrite,
                SideEffectClass::LocalReversible,
            )),
        );

        assert_eq!(decision.disposition, PolicyDisposition::Allow);
        assert_eq!(decision.effective_commitment_ceiling, CommitmentTier::Prepare);
    }

    #[test]
    fn external_write_in_shadow_does_not_dispatch() {
        let mut unit = unit("send", "mail.send");
        unit.input.insert("target".to_string(), "alex@example.com".to_string());
        let decision = evaluate_operation(
            &SafetyConfig::default(),
            &graph(vec![unit.clone()]),
            &unit,
            Some(&capability(
                "mail.send",
                SemanticRiskClass::ExternalWrite,
                SideEffectClass::ExternalConsequential,
            )),
        );

        assert_eq!(decision.disposition, PolicyDisposition::Deny);
        assert!(decision
            .reason_codes
            .contains(&PolicyReasonCode::ShadowExternalWritePreviewOnly));
    }

    #[test]
    fn external_write_in_confirm_requires_approval() {
        let mut unit = unit("send", "mail.send");
        unit.input.insert("target".to_string(), "alex@example.com".to_string());
        let decision = evaluate_operation(
            &SafetyConfig {
                mode: SafetyMode::Confirm,
                ..SafetyConfig::default()
            },
            &graph(vec![unit.clone()]),
            &unit,
            Some(&capability(
                "mail.send",
                SemanticRiskClass::ExternalWrite,
                SideEffectClass::ExternalConsequential,
            )),
        );

        assert_eq!(decision.disposition, PolicyDisposition::RequireApproval);
        assert!(decision.approval_required);
    }

    #[test]
    fn destructive_and_unknown_effects_are_denied() {
        let destructive = unit("destroy", "destroy.capability");
        let destructive_decision = evaluate_operation(
            &SafetyConfig::default(),
            &graph(vec![destructive.clone()]),
            &destructive,
            Some(&capability(
                "destroy.capability",
                SemanticRiskClass::Destructive,
                SideEffectClass::Destructive,
            )),
        );
        assert_eq!(destructive_decision.disposition, PolicyDisposition::Deny);

        let unknown = unit("unknown", "unknown.capability");
        let unknown_decision = evaluate_operation(
            &SafetyConfig::default(),
            &graph(vec![unknown.clone()]),
            &unknown,
            Some(&capability(
                "unknown.capability",
                SemanticRiskClass::Unknown,
                SideEffectClass::Unknown,
            )),
        );
        assert_eq!(unknown_decision.disposition, PolicyDisposition::Deny);
    }

    #[test]
    fn unknown_or_unavailable_capabilities_are_denied() {
        let unit = unit("read", "missing.capability");
        let unknown = evaluate_operation(&SafetyConfig::default(), &graph(vec![unit.clone()]), &unit, None);
        assert!(unknown.reason_codes.contains(&PolicyReasonCode::UnknownCapability));

        let mut descriptor = capability(
            "missing.capability",
            SemanticRiskClass::SafeRead,
            SideEffectClass::None,
        );
        descriptor.availability = CapabilityAvailability::Unavailable;
        let unavailable = evaluate_operation(
            &SafetyConfig::default(),
            &graph(vec![unit.clone()]),
            &unit,
            Some(&descriptor),
        );
        assert!(unavailable
            .reason_codes
            .contains(&PolicyReasonCode::CapabilityUnavailable));
    }

    #[test]
    fn operation_count_scope_and_risk_mismatch_are_denied() {
        let units = vec![
            unit("a", "test.read"),
            unit("b", "test.read"),
            unit("c", "test.read"),
            unit("d", "test.read"),
        ];
        let decision = evaluate_operation(
            &SafetyConfig::default(),
            &graph(units.clone()),
            &units[0],
            Some(&capability("test.read", SemanticRiskClass::SafeRead, SideEffectClass::None)),
        );
        assert!(decision
            .reason_codes
            .contains(&PolicyReasonCode::OperationLimitExceeded));

        let mismatch = evaluate_operation(
            &SafetyConfig::default(),
            &graph(vec![units[0].clone()]),
            &units[0],
            Some(&capability(
                "test.read",
                SemanticRiskClass::SafeRead,
                SideEffectClass::ExternalConsequential,
            )),
        );
        assert!(mismatch
            .reason_codes
            .contains(&PolicyReasonCode::RiskSideEffectMismatch));
    }

    #[test]
    fn stale_context_and_external_content_cannot_authorize_external_action() {
        let mut unit = unit("send", "mail.send");
        unit.input.insert("target".to_string(), "alex@example.com".to_string());
        unit.input
            .insert("instructionAuthority".to_string(), "external_content".to_string());
        let descriptor = capability(
            "mail.send",
            SemanticRiskClass::ExternalWrite,
            SideEffectClass::ExternalConsequential,
        );
        let decision = evaluate_operation(
            &SafetyConfig {
                mode: SafetyMode::Confirm,
                context_revision_current: false,
                ..SafetyConfig::default()
            },
            &graph(vec![unit.clone()]),
            &unit,
            Some(&descriptor),
        );

        assert!(decision.reason_codes.contains(&PolicyReasonCode::StaleContext));
        assert!(decision
            .reason_codes
            .contains(&PolicyReasonCode::ExternalContentNoAuthority));
        assert_eq!(decision.disposition, PolicyDisposition::Deny);
    }
}
