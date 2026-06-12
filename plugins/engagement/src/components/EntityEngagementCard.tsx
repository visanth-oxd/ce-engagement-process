import React from 'react';
import { useEntity } from '@backstage/plugin-catalog-react';
import { InfoCard } from '@backstage/core-components';
import {
  Chip,
  Step,
  StepLabel,
  Stepper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@material-ui/core';
import { EngagementEntityV1alpha1 } from '@internal/plugin-engagement-common';
import { PIPELINE_STAGES, pipelineIndex, isClosed, iaProgress } from '../stages';

const IA_STATUS_COLOR: Record<string, 'default' | 'primary' | 'secondary'> = {
  'complete': 'primary',
  'in-progress': 'secondary',
  'pending': 'default',
};

/**
 * Stage pipeline + IA/environment status for the Engagement entity page.
 * Read-only by design: the workflow lives in Jira; this card is the read
 * model. The Jira ticket is one click away via the issue-key annotation.
 */
export const EntityEngagementCard = () => {
  const { entity } = useEntity<EngagementEntityV1alpha1>();
  const spec = entity.spec ?? ({} as EngagementEntityV1alpha1['spec']);
  const stageIdx = pipelineIndex(spec.stage);
  const closed = isClosed(spec.stage);
  const ia = iaProgress(spec.impactAssessments);
  const jiraKey = entity.metadata.annotations?.['jira/issue-key'];

  return (
    <InfoCard
      title="Engagement pipeline"
      subheader={
        jiraKey
          ? `Jira ${jiraKey} is the state machine; this view is a mirror.`
          : undefined
      }
    >
      {closed ? (
        <Chip label="Closed" color="primary" data-testid="engagement-closed" />
      ) : (
        <Stepper activeStep={stageIdx} alternativeLabel>
          {PIPELINE_STAGES.map(s => (
            <Step key={s.stage}>
              <StepLabel>{s.label}</StepLabel>
            </Step>
          ))}
        </Stepper>
      )}

      {(spec.impactAssessments?.length ?? 0) > 0 && (
        <>
          <Typography variant="subtitle2" gutterBottom>
            Impact assessments ({ia.complete}/{ia.total} complete)
          </Typography>
          <Table size="small" data-testid="engagement-ia-table">
            <TableHead>
              <TableRow>
                <TableCell>Team</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Ticket</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {spec.impactAssessments!.map(row => (
                <TableRow key={row.team}>
                  <TableCell>{row.team}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={row.status}
                      color={IA_STATUS_COLOR[row.status] ?? 'default'}
                    />
                  </TableCell>
                  <TableCell>{row.jiraKey ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}

      {(spec.environments?.length ?? 0) > 0 && (
        <>
          <Typography variant="subtitle2" gutterBottom>
            Environments
          </Typography>
          {spec.environments!.map(env => (
            <Chip
              key={env.resource}
              size="small"
              label={`${env.resource.split('/').pop()}: ${env.status}`}
              color={env.status === 'allocated' ? 'primary' : 'default'}
              style={{ marginRight: 8 }}
            />
          ))}
        </>
      )}
    </InfoCard>
  );
};
