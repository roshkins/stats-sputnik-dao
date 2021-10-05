import React from 'react';

export function ComparisonCell(props) {
    return <div>
        {props.value}
        <br />
        {props.priorWeekValue !== undefined ? Math.round(props.priorWeekValue) : null}
    </div>
}