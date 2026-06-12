import {
  createPlugin,
  createComponentExtension,
} from '@backstage/core-plugin-api';

export const engagementPlugin = createPlugin({
  id: 'engagement',
});

/**
 * Stage pipeline card for the Engagement entity page. Wire it in
 * packages/app/src/components/catalog/EntityPage.tsx:
 *
 *   import { EntityEngagementCard } from '@internal/plugin-engagement';
 *   // inside a case for kind Engagement:
 *   <Grid item md={8}><EntityEngagementCard /></Grid>
 */
export const EntityEngagementCard = engagementPlugin.provide(
  createComponentExtension({
    name: 'EntityEngagementCard',
    component: {
      lazy: () =>
        import('./components/EntityEngagementCard').then(
          m => m.EntityEngagementCard,
        ),
    },
  }),
);
