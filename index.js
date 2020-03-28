const { Subject, of, defer, EMPTY } = require('rxjs');
const { delay, share, flatMap, switchMap, first } = require('rxjs/operators');
const fetch = require('node-fetch');
const dotenv = require('dotenv');
const inquirer = require('inquirer');
const autocomplete = require('inquirer-autocomplete-prompt');

dotenv.config();

inquirer.registerPrompt('autocomplete', autocomplete);

const searchProject = (new Subject()).pipe(
    // Use switch map so the only values that are dropped are the ones that were dropped by the handler already.
    switchMap((value) => {
        if ( !value ) {
            return of([]);
        }

        return of(value).pipe(
            delay(200),
            flatMap((v) => {
                const url = new URL('/api/project.search', process.env.PHABRICATOR_URL);
                const query = new URLSearchParams();
                query.set('api.token', process.env.PHABRICATOR_CONDUIT_API_TOKEN);
                query.set('constraints[query]', v);
                query.set('order', 'relevance');

                return defer(() => fetch(url.toString(), {
                    method: 'POST',
                    body: query.toString(),
                })).pipe(
                    flatMap(response => response.json()),
                    flatMap(({ result: { data } }) => {
                        return of(data.map(({ phid, fields }) => ({
                            name: fields.parent ? `${fields.name} (${fields.parent.name})` : fields.name,
                            value: phid,
                        })));
                    })
                );
            }),
        );
    }),
    // Keep alive.
    share(),
);

function handleSource(answers, value) {
    const options = searchProject.pipe(first()).toPromise();
    searchProject.next(value);

    return options;
}

async function fetchTasks(source, tag) {
    const url = new URL('/api/maniphest.search', process.env.PHABRICATOR_URL);
    const query = new URLSearchParams();
    query.set('api.token', process.env.PHABRICATOR_CONDUIT_API_TOKEN);
    query.set('constraints[projects][0]', source);
    query.set('constraints[projects][1]', tag);
    query.set('constraints[statuses][0]', 'resolved');
    query.set('attachments[projects]', '1');

    const response = await fetch(url.toString(), {
        method: 'POST',
        body: query.toString(),
    });

    const { result: { data } } = await response.json();

    return data;
}

async function main() {
    const { source, tag, destination } = await inquirer.prompt([
        {
            type: 'autocomplete',
            name: 'source',
            message: 'Source Project',
            source: handleSource
        },
        {
            type: 'autocomplete',
            name: 'tag',
            message: 'Tag',
            source: handleSource
        },
        {
            type: 'autocomplete',
            name: 'destination',
            message: 'Destination',
            source: handleSource
        },
    ]);

    console.log('ANSWERS', source, tag, destination);

    const tasks = await fetchTasks(source, tag);

    if (tasks.length === 0) {
        console.log('No tasks to copy!');
        return;
    }

    const { confirm } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'confirm',
            message: `Copy ${tasks.length} task(s)?`,
        },
    ]);

    if (!confirm) {
        return;
    }
}

main();
