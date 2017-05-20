let name = 'hi'
let reg = new RegExp(name, 'i');
console.log(reg.test('clinton')); 
console.log(reg.test('sasaHisasa')); 

<p class="control">
                <span class="select">
                    <select name="sort-by" required>
                        <option value="" selected>Sort by: </option>
                        <option value="date-asc">Date (Ascending)</option>
                        <option value="date-desc">Date (Descending)</option>
                        <option value="alpha-asc" disabled>Alphabetically (Ascending)</option>
                        <option value="alpha-desc" disabled>Alphabetically (Descending)</option>
                    </select>
                </span>
            </p>