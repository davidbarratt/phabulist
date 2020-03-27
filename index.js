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
}

main();
