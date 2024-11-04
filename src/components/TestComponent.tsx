// src/components/TestComponent.tsx

import { onMount } from 'solid-js';
import { fetchFirstFiveRows, invokePrintFirstFiveRows } from '../api';

const TestComponent = () => {
    onMount(() => {
        console.log('TestComponent mounted');
        const getData = async () => {
            console.log('fetchFirstFiveRows function called');
            try {
                const firstFiveRows = await fetchFirstFiveRows();
                console.log('First 5 Rows:', firstFiveRows);
                // Additionally, invoke the backend command to print data
                await invokePrintFirstFiveRows();
            } catch (error) {
                console.error('Error fetching first 5 rows:', error);
            }
        };

        getData();
    });

    return (
        <div>
            <h1>Test Database Connection</h1>
            <p>Check the console for the first 5 rows of data.</p>
        </div>
    );
};

export default TestComponent;