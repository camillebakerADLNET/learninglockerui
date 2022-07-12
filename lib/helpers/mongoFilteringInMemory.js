/* eslint-disable no-use-before-define */
import sift from 'sift';

// sift.use({
//   $comment: () => true
// });

// const match = filter => actual => sift(filter, [actual]).length > 0;

export default (filter, actual) => {

    /**
     * After version 7 of sift, the .use() feature was removed,
     * meaning that we will instead need to remove all comments from
     * the filter prior to requesting a comparison here. 
     * */ 

    let $match = filter.$match;
    let $and = $match !== undefined ? $match.$and : filter.$and;

    if ($and !== undefined) {
        for (let clause of $and) {
            delete clause.$comment;
        }
    }

    return [actual].filter(sift(filter)).length > 0;
};
