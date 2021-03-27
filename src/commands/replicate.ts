import { Command } from '@oclif/command';
import { Subject, of, defer, from } from 'rxjs';
import { delay, share, flatMap, switchMap, first } from 'rxjs/operators';
import fetch, { RequestInfo, RequestInit } from 'node-fetch';
import * as inquirer from 'inquirer';
import * as autocomplete from 'inquirer-autocomplete-prompt';

inquirer.registerPrompt('autocomplete', autocomplete);

interface Option {
  name: string;
  value: string;
}

enum PhabricatorObjectType {
  PROJ = 'PROJ',
  TASK = 'TASK',
}

interface PhabricatorTaskPriority {
  name: string;
  keywords: string[];
  short: string;
  color: string;
  value: number;
}

interface PhabricatorTask {
  id: number;
  type: PhabricatorObjectType.TASK;
  phid: string;
  fields: {
    name: string;
    description: {
      raw: string;
    };
    authorPHID: string;
    ownerPHID: string;
    status: {
      value: string;
      name: string;
      color: string|null;
    };
    priority: {
      value: number;
      name: string;
      color: string;
    };
    points: string;
    subtype: string;
    closerPHID: string;
    dateClosed: number;
    spacePHID: string | null;
    dateCreated: string;
    dateModified: string;
    policy: {
      view: string;
      interact: string;
      edit: string;
    };
  };
  attachments: {
    projects?: {
      projectPHIDs: string[];
    };
  };
}

interface PhabricatorProject {
  id: number;
  type: PhabricatorObjectType.PROJ;
  phid: string;
  fields: {
    name: string;
    slug: string|null;
    subtype: string;
    milestone: number;
    depth: number;
    parent: {
      id: number;
      phid: string;
      name: string;
    };
    icon: {
      key: string;
      name: string;
      icon: string;
    };
    color: {
      key: string;
      name: string|null;
    };
    spacePHID: string | null;
    dateCreated: number;
    dateModified: number;
    policy: {
      view: string;
      edit: string;
      join: string;
    };
    description: string|null;
  };
  attachments: Record<string, any>[];
}

interface PhabricatorResult<T> {
  data: T;
}

interface ConduitResponse<T> {
  result: PhabricatorResult<T>|null;
  error_code: string|null;
  error_info: string|null;
}

export default class Replicate extends Command {
  static description = 'Duplicate tasks from one project to another';

  private searchSubject = new Subject<string>();

  private searchProject = this.searchSubject.pipe(
    // Use switch map so the only values that are dropped are the ones that were dropped by the handler already.
    switchMap(value => {
      if (!value) {
        return of([]);
      }

      return of(value).pipe(
        // This is still going to execute it... should figure out how to change this to a debounce.
        delay(200),
        flatMap(v => {
          const url = new URL('/api/project.search', process.env.PHABRICATOR_URL);
          const query = new URLSearchParams();
          query.set('api.token', process.env.PHABRICATOR_CONDUIT_API_TOKEN || '');
          query.set('constraints[query]', v);
          query.set('order', 'relevance');

          return defer(() => this.conduitFetch<PhabricatorProject[]>(url.toString(), {
            body: query.toString(),
          })).pipe(
            flatMap(({ data = [] }) => (
              of<Option[]>(data.map(({ phid, fields }) => ({
                name: fields.parent ? `${fields.name} (${fields.parent.name})` : fields.name,
                value: phid,
              })))
            ))
          );
        }),
      );
    }),
    // Keep alive.
    share(),
  );

  private handleSource(answers: Option[], value: string) {
    const options = this.searchProject.pipe(first()).toPromise();
    this.searchSubject.next(value);

    return options;
  }

  private async conduitFetch<T>(resource: RequestInfo, options: RequestInit | undefined = {}) {
    const response = await fetch(resource, {
      method: 'POST',
      ...options,
    });

    const conduitResponse = await response.json() as ConduitResponse<T>;

    if (!conduitResponse.result) {
      throw new Error(conduitResponse.error_info || 'Phabricator API Error');
    }

    return conduitResponse.result;
  }

  private async fetchPriorities() {
    const url = new URL('/api/maniphest.priority.search', process.env.PHABRICATOR_URL);
    const query = new URLSearchParams();
    query.set('api.token', process.env.PHABRICATOR_CONDUIT_API_TOKEN || '');

    const result = await this.conduitFetch<PhabricatorTaskPriority[]>(url.toString(), {
      body: query.toString(),
    });

    return result.data || [];
  }

  private async fetchTasks(source: string, tag: string) {
    const url = new URL('/api/maniphest.search', process.env.PHABRICATOR_URL);
    const query = new URLSearchParams();
    query.set('api.token', process.env.PHABRICATOR_CONDUIT_API_TOKEN || '');
    query.set('constraints[projects][0]', source);
    query.set('constraints[projects][1]', tag);
    query.set('constraints[statuses][0]', 'resolved');
    query.set('attachments[projects]', '1');

    const result = await this.conduitFetch<PhabricatorTask[]>(url.toString(), {
      body: query.toString(),
    });

    return result.data || [];
  }

  async run() {
    const prioritiesFetch = this.fetchPriorities();

    const { source, tag } = await inquirer.prompt([
      {
        type: 'autocomplete',
        name: 'source',
        message: 'Source Project',
        source: this.handleSource.bind(this),
      },
      {
        type: 'autocomplete',
        name: 'tag',
        message: 'Tag',
        source: this.handleSource.bind(this),
      },
    ]);

    const tasks = await this.fetchTasks(source, tag);

    if (tasks.length === 0) {
      this.log('No tasks to copy!');
      return;
    }

    const { destination } = await inquirer.prompt([
      {
        type: 'autocomplete',
        name: 'destination',
        message: 'Destination',
        source: this.handleSource.bind(this),
      },
    ]) as { destination: string };

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `Copy ${tasks.length} task(s)?`,
        suffix: '\n' + tasks.map(task => `T${task.id} ${task.fields.name}`).join('\n') + '\n',
      },
    ]);

    if (!confirm) {
      return;
    }

    // This should be done by now.
    const priorities = await prioritiesFetch;

    const edits = from(tasks).pipe(
      flatMap(task => {
        const { fields, attachments } = task;
        const url = new URL('/api/maniphest.edit', process.env.PHABRICATOR_URL);
        const query = new URLSearchParams();
        query.set('api.token', process.env.PHABRICATOR_CONDUIT_API_TOKEN || '');

        let transactions = [
          {
            type: 'title',
            value: fields.name,
          },
          {
            type: 'status',
            value: 'open',
          },
          {
            type: 'priority',
            value: priorities.find(p => p.value === fields.priority.value)?.keywords[0] || '',
          },
          {
            type: 'points',
            value: fields.points,
          },
          {
            type: 'description',
            value: fields.description.raw,
          },
          {
            type: 'owner',
            value: fields.ownerPHID,
          },
          {
            type: 'projects.set',
            value: [
              ...attachments.projects?.projectPHIDs.filter(phid => phid !== source) || [],
              destination,
            ],
          },
        ];

        if (fields.spacePHID) {
          transactions = [
            ...transactions,
            {
              type: 'space',
              value: fields.spacePHID,
            },
          ];
        }

        transactions.forEach(({ type, value }, i) => {
          query.set(`transactions[${i}][type]`, type);
          if (Array.isArray(value)) {
            value.forEach((v, k) => {
              query.set(`transactions[${i}][value][${k}]`, v);
            });
          } else {
            query.set(`transactions[${i}][value]`, value);
          }
        });

        return defer(() => fetch(url.toString(), {
          method: 'POST',
          body: query.toString(),
        })).pipe(
          flatMap(response => response.json()),
        );
      }, 2),
    );

    edits.subscribe(({ result: { object: { id } } }) => {
      this.log(`Created T${id}`);
    });
  }
}
