use super::contracts::*;
use super::data_guard::redact_metadata_values;
use super::policy::evaluate_operation;

#[derive(Clone, Debug, PartialEq, Eq)]
#[allow(dead_code)]
pub(crate) enum AuthorizationEvidence {
    PolicyAllowed {
        decision: PolicyDecision,
    },
    OneTimeApproval {
        approval_id: ApprovalId,
        binding: ApprovalBinding,
        decision: PolicyDecision,
    },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct AuthorizedOperation {
    operation: WorkUnit,
    evidence: AuthorizationEvidence,
}

impl AuthorizedOperation {
    pub(crate) fn unit(&self) -> &WorkUnit {
        &self.operation
    }

    #[cfg(test)]
    pub(crate) fn evidence(&self) -> &AuthorizationEvidence {
        &self.evidence
    }

    fn from_policy(operation: WorkUnit, decision: PolicyDecision) -> Result<Self, ControlPlaneError> {
        if decision.disposition != PolicyDisposition::Allow {
            return Err(ControlPlaneError::new(
                ControlPlaneErrorKind::PolicyBlocked,
                decision.explanation,
            ));
        }
        Ok(Self {
            operation,
            evidence: AuthorizationEvidence::PolicyAllowed { decision },
        })
    }

    #[allow(dead_code)]
    fn from_approval(
        operation: WorkUnit,
        approval_id: ApprovalId,
        binding: ApprovalBinding,
        decision: PolicyDecision,
    ) -> Result<Self, ControlPlaneError> {
        if decision.disposition != PolicyDisposition::RequireApproval {
            return Err(ControlPlaneError::new(
                ControlPlaneErrorKind::PolicyBlocked,
                "one-time approval evidence can only authorize an approval-required operation",
            ));
        }
        Ok(Self {
            operation,
            evidence: AuthorizationEvidence::OneTimeApproval {
                approval_id,
                binding,
                decision,
            },
        })
    }
}

pub(crate) fn authorize_for_dispatch(
    config: &SafetyConfig,
    graph: &TaskGraph,
    operation: WorkUnit,
    capability: Option<&SemanticCapabilityDescriptor>,
) -> Result<AuthorizedOperation, ControlPlaneError> {
    let decision = evaluate_operation(config, graph, &operation, capability);
    AuthorizedOperation::from_policy(operation, decision)
}

#[allow(dead_code)]
pub(crate) fn authorize_with_approval(
    config: &SafetyConfig,
    graph: &TaskGraph,
    operation: WorkUnit,
    capability: &SemanticCapabilityDescriptor,
    approval: &ApprovalRequest,
    now_ms: u64,
) -> Result<AuthorizedOperation, ControlPlaneError> {
    let decision = evaluate_operation(config, graph, &operation, Some(capability));
    if decision.disposition != PolicyDisposition::RequireApproval {
        return Err(ControlPlaneError::new(
            ControlPlaneErrorKind::PolicyBlocked,
            "current operation does not require approval",
        ));
    }

    let Some(binding) = &approval.binding else {
        return Err(ControlPlaneError::new(
            ControlPlaneErrorKind::PolicyBlocked,
            "approval request is missing exact action binding",
        ));
    };

    validate_approval_binding(graph, &operation, approval, now_ms)?;
    AuthorizedOperation::from_approval(
        operation,
        ApprovalId::new(approval.approval_id.clone()),
        binding.clone(),
        decision,
    )
}

pub(crate) fn validate_approval_binding(
    graph: &TaskGraph,
    operation: &WorkUnit,
    approval: &ApprovalRequest,
    now_ms: u64,
) -> Result<(), ControlPlaneError> {
    if approval.expires_at_ms <= now_ms {
        return Err(ControlPlaneError::new(
            ControlPlaneErrorKind::PolicyBlocked,
            "approval request has expired",
        ));
    }

    if approval.plan_revision != graph.plan_revision {
        return Err(ControlPlaneError::new(
            ControlPlaneErrorKind::PolicyBlocked,
            "approval request does not match the current plan revision",
        ));
    }

    if approval.operation_id != operation.work_unit_id.as_str() {
        return Err(ControlPlaneError::new(
            ControlPlaneErrorKind::PolicyBlocked,
            "approval request does not match the current operation",
        ));
    }

    let Some(binding) = &approval.binding else {
        return Err(ControlPlaneError::new(
            ControlPlaneErrorKind::PolicyBlocked,
            "approval request is missing exact action binding",
        ));
    };

    let current = approval_binding_for_work_unit(
        &approval.approval_id,
        graph,
        operation,
        approval.expires_at_ms,
        &approval.expected_effect,
        &approval.data_disclosure,
        binding.context_snapshot_revision,
    );
    if binding != &current {
        return Err(ControlPlaneError::new(
            ControlPlaneErrorKind::PolicyBlocked,
            "approved action no longer matches the current operation",
        ));
    }

    Ok(())
}

pub(crate) fn approval_binding_for_work_unit(
    approval_id: &str,
    graph: &TaskGraph,
    operation: &WorkUnit,
    expires_at_ms: u64,
    expected_effect: &str,
    data_disclosure: &str,
    context_snapshot_revision: Option<u64>,
) -> ApprovalBinding {
    ApprovalBinding {
        approval_id: approval_id.to_string(),
        operation_id: operation.work_unit_id.to_string(),
        plan_id: graph.graph_id.to_string(),
        plan_revision: graph.plan_revision,
        capability_id: operation.capability_id.clone(),
        target_binding: target_binding_for_work_unit(graph, operation),
        normalized_input: redact_metadata_values(&operation.input),
        side_effect_class: operation.execution_policy.side_effect_class.clone(),
        expected_effect: expected_effect.to_string(),
        data_disclosure: data_disclosure.to_string(),
        expires_at_ms,
        context_snapshot_revision,
    }
}

fn target_binding_for_work_unit(graph: &TaskGraph, operation: &WorkUnit) -> Metadata {
    let mut binding = Metadata::new();
    binding.insert("graphId".to_string(), graph.graph_id.to_string());
    binding.insert("workUnitId".to_string(), operation.work_unit_id.to_string());
    binding.insert("capabilityId".to_string(), operation.capability_id.clone());
    binding.insert(
        "target".to_string(),
        operation
            .input
            .get("target")
            .or_else(|| operation.input.get("recipient"))
            .or_else(|| operation.input.get("objectReference"))
            .cloned()
            .unwrap_or_else(|| operation.title.clone()),
    );
    binding
}

#[cfg(test)]
mod tests {
    use super::*;

    fn capability() -> SemanticCapabilityDescriptor {
        SemanticCapabilityDescriptor {
            capability_id: "mail.send".to_string(),
            provider_binding: "fake-mail".to_string(),
            input_contract: "mail.send.input.v1".to_string(),
            output_contract: "mail.send.output.v1".to_string(),
            operation_kind: OperationKind::MutateExternal,
            read_or_write: ReadOrWrite::Write,
            availability: CapabilityAvailability::Available,
            risk_class: SemanticRiskClass::ExternalWrite,
            approval_requirement: ApprovalRequirement::ExplicitUserApproval,
            timeout_ms: 500,
            supports_cancellation: false,
            idempotency_semantics: "non-idempotent".to_string(),
            side_effect_class: SideEffectClass::ExternalConsequential,
            reversibility: "not reliably reversible".to_string(),
            required_permissions: Vec::new(),
        }
    }

    fn operation() -> WorkUnit {
        let mut input = Metadata::new();
        input.insert("target".to_string(), "alex@example.com".to_string());
        input.insert("body".to_string(), "hello".to_string());
        WorkUnit {
            work_unit_id: WorkUnitId::new("send-1"),
            kind: WorkUnitKind::PureSynthesis,
            capability_id: "mail.send".to_string(),
            title: "Send message".to_string(),
            dependencies: Vec::new(),
            join_policy: JoinPolicy::AllSucceeded,
            execution_policy: ExecutionPolicy {
                timeout_ms: 500,
                approval_requirement: ApprovalRequirement::ExplicitUserApproval,
                side_effect_class: SideEffectClass::ExternalConsequential,
                retry_policy: RetryPolicy {
                    max_attempts: 1,
                    retry_idempotent_only: true,
                },
                idempotency_key: None,
                supports_cancellation: false,
            },
            input,
            state: OperationState::AwaitingApproval,
        }
    }

    fn graph(operation: WorkUnit) -> TaskGraph {
        TaskGraph {
            graph_id: TaskGraphId::new("graph-1"),
            session_id: SessionId::new("session-1"),
            objective_id: ObjectiveId::new("objective-1"),
            plan_revision: 7,
            work_units: vec![operation],
            created_at_ms: 1,
        }
    }

    fn approval(graph: &TaskGraph, operation: &WorkUnit, expires_at_ms: u64) -> ApprovalRequest {
        let binding = approval_binding_for_work_unit(
            "approval-1",
            graph,
            operation,
            expires_at_ms,
            "Send one message.",
            "Message body leaves Adaptive Surface through mail.",
            Some(3),
        );
        ApprovalRequest {
            approval_id: "approval-1".to_string(),
            session_id: graph.session_id.to_string(),
            operation_id: operation.work_unit_id.to_string(),
            plan_id: graph.graph_id.to_string(),
            plan_revision: graph.plan_revision,
            capability_id: operation.capability_id.clone(),
            commitment_tier: CommitmentTier::Commit,
            actor: ApprovalActor::User,
            target: "alex@example.com".to_string(),
            scope: "single message".to_string(),
            expected_effect: "Send one message.".to_string(),
            data_disclosure: "Message body leaves Adaptive Surface through mail.".to_string(),
            reversibility: "not reliably reversible".to_string(),
            reason: "External write requires approval.".to_string(),
            side_effect_class: Some(SideEffectClass::ExternalConsequential),
            preview: operation.input.clone(),
            expires_at_ms,
            binding: Some(binding),
        }
    }

    #[test]
    fn correct_approval_authorizes_exact_operation() {
        let operation = operation();
        let graph = graph(operation.clone());
        let approval = approval(&graph, &operation, 100);
        let authorized = authorize_with_approval(
            &SafetyConfig {
                mode: SafetyMode::Confirm,
                ..SafetyConfig::default()
            },
            &graph,
            operation,
            &capability(),
            &approval,
            50,
        )
        .expect("approval should authorize exact operation");

        assert!(matches!(
            authorized.evidence(),
            AuthorizationEvidence::OneTimeApproval { .. }
        ));
    }

    #[test]
    fn expired_or_old_revision_approval_is_rejected() {
        let operation = operation();
        let graph = graph(operation.clone());
        let expired = approval(&graph, &operation, 40);
        let error = validate_approval_binding(&graph, &operation, &expired, 50)
            .expect_err("expired approval should fail");
        assert_eq!(error.kind, ControlPlaneErrorKind::PolicyBlocked);

        let mut old = approval(&graph, &operation, 100);
        old.plan_revision = 6;
        let error = validate_approval_binding(&graph, &operation, &old, 50)
            .expect_err("old revision should fail");
        assert_eq!(error.kind, ControlPlaneErrorKind::PolicyBlocked);
    }

    #[test]
    fn changed_target_input_or_capability_invalidates_approval() {
        let operation = operation();
        let graph = graph(operation.clone());
        let approval = approval(&graph, &operation, 100);

        let mut changed_target = operation.clone();
        changed_target
            .input
            .insert("target".to_string(), "other@example.com".to_string());
        assert!(validate_approval_binding(&graph, &changed_target, &approval, 50).is_err());

        let mut changed_input = operation.clone();
        changed_input.input.insert("body".to_string(), "changed".to_string());
        assert!(validate_approval_binding(&graph, &changed_input, &approval, 50).is_err());

        let mut changed_capability = operation;
        changed_capability.capability_id = "slack.post".to_string();
        assert!(validate_approval_binding(&graph, &changed_capability, &approval, 50).is_err());
    }
}
