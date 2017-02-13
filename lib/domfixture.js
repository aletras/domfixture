var jsdom = require("jsdom");
var xhr = require("mock-xmlhttprequest");

exports.configure = function(options) {
    
    var tests = [];    
    var defaultSetup = null;

    process.stdout.write("\033c");
    console.log("Test fixture ready...")    

    var execute = function(index) {
        index = index || 0;

        //Execute each of the tests in the test collection            
        if (tests.length && tests.length > index) {

            var test = tests[index];            
            var testContext = {};                          

            jsdom.env({
               file: options.html,
               scripts: options.scripts,
               oncreated: function(err, window) {
                    // If there was a problem creating our jsdom environment
                    // there is no need to continue
                    if (err) throw err;    
               },
               onload: function(window) {                                 
                    // Building out the testContext with newly created jsdom
                    testContext = {
                        window: window,
                        xhr: new mockXhr(window.XMLHttpRequest = xhr),
                        assert: new assert(function(message){ 
                            if (!options.continueOnFail) {
                                throw test.description + " has failed (" + message + ")";
                            }
                        }),
                        $: window.$ || {} //Make things a bit easier for jQuery users
                    };

                    // Execute the default setup if one was defined
                    if (defaultSetup) {
                        defaultSetup.call(null, testContext);
                    }

                    // Execute the specific test's setup method if one was defined
                    if (test.setup) {
                        test.setup.call(null, testContext);
                    };                   
               },
               done: function(err, window) {
                    
                    // Create a timer to handle the test timeout as defined by the test.timeout value
                    var timer = setTimeout(function() { 
                        throw test.description + " has timed out!" 
                    }, test.timeout);

                    // If this a test with async activity, we will wait until the test indicates it is done before
                    // moving on to the next test.  However, if it does not contain async activity, just run and move to 
                    // the next test
                    if (test.async) {
                        testContext["done"] = function() {
                            console.log(" - " + test.description + " \x1b[92m(Done)\x1b[97m");  
                            clearTimeout(timer);
                            execute(++index);                                    
                        };
                        test.body.call(null, testContext);                                    
                    } else {
                        test.body.call(null, testContext);  
                        clearTimeout(timer);                                  
                        execute(++index);
                    }
                    
                } 
            });            
        } else {
            summary();
        }       
    };

    var summary = function() {
        console.log(tests.length  + " tests executed");
    };

    return {
        
        setup: function(setupBody) {
            if (typeof setupBody !== 'function') throw "Setup must be a function";     
            defaultSetup = setupBody;                   
        },            
        addTest: function(description, testBody, isAsync) {       
            if (typeof testBody !== 'function') throw "Test must be a function";

            var test = {
                description: description,
                body: testBody,
                async: isAsync || false,
                timeout: 10 * 1000, //10 Second default
                setup: null
            };

            tests.push(test);    

            return { 
                setup: function(setupBody) {  
                    if (typeof setupBody !== 'function') throw "Setup must be a function";                         
                    test.setup = setupBody;
                    return this;
                },
                timeout: function(value) {         
                    if (isNaN(value)) throw "Timeout value must be numeric"           
                    test.timeout = value;                    
                    return this;
                }
            }
        }, 
        addAsyncTest: function(description, testBody) {       
            return this.addTest(description, testBody, true);
        },          
        executeTests: function() {            
            execute();
        }            
    };
};

// Mock XHR class
var mockXhr = function(realXhr) {

    var handlers = {};
    var init = function() {
        handlers = {
            urlIsHandlers: {},
            urlEndsWithHandlers: {},
            urlStartsWithHandlers: {},        
            urlContainsHandlers: {},
            anyHandler: null
        };        
    };
    init();

    var hasHandlers = function(obj){
        for (var prop in obj) {
            if (obj.hasOwnProperty(prop)) return true;
        }    
        return false;  
    };

    // Bind the onSend event of the actually XHR object to a function that will evaluate the url and choose the appropriate
    // handler based on specificity rules.  This is the specificity hierarchy (urlIs, urlEndsWith, urlStartsWith, urlContains, Any [the catch all])
    realXhr.onSend = function(xhr) {

        var handlerFunc;        

        // First we'll checkout for a handler or the exact url
        if (hasHandlers(handlers.urlIsHandlers) && handlers.urlIsHandlers[xhr.url.toLowerCase()]) {
            handlers.urlIsHandlers[xhr.url.toLowerCase()].call(null, xhr);
            return;
        }

        // Second we'll check for an ends with handler
        if (hasHandlers(handlers.urlEndsWithHandlers)) {
            for (var handler in handlers.urlEndsWithHandlers) {
                if (xhr.url.toLowerCase().endsWith(handler)) {
                    handlers.urlEndsWithHandlers[handler].call(null, xhr);
                    return;
                }                
            }
        }
        
        // Third we'll check for an starts with handler
        if (hasHandlers(handlers.urlStartsWithHandlers)) {
            for (var handler in handlers.urlStartsWithHandlers) {
                if (xhr.url.toLowerCase().startsWith(handler)) {
                    handlers.urlStartsWithHandlers[handler].call(null, xhr);
                    return;
                }                
            }
        }

        // Fourth we'll check for a contains handler
        if (hasHandlers(handlers.urlContainsHandlers)) {
            for (var handler in handlers.urlContainsHandlers) {
                if (xhr.url.toLowerCase().includes(handler)) {
                    handlers.urlContainsHandlers[handler].call(null, xhr);
                    return;
                }                
            }
        }     

        // Finally we'll check if we have a catch all handler and if not we'll return a 500
        if (handlers.anyHandler && typeof handlers.anyHandler === 'function') {
            handlers.anyHandler.call(null, xhr);
            return;
        }

        xhr.respond(500, {}, null, "This end point does not have a mock handler and therefore can not return data");     
    };

    return {
        whenUrlIs: function(url, func) {            
            if (func) {
                if (typeof func !== 'function') throw "Handler must be a function";
                handlers.urlIsHandlers[url.toLowerCase()] = func;
            } else {
                delete handlers.urlIsHandlers[url.toLowerCase()];
            }            
        },
        whenUrlEndsWith: function(urlPart, func) {            
            if (func) {
                if (typeof func !== 'function') throw "Handler must be a function";
                handlers.urlEndsWithHandlers[urlPart.toLowerCase()] = func; 
            } else {
                delete handlers.urlEndsWithHandlers[urlPart.toLowerCase()];
            }
        },
        whenUrlStartsWith: function(urlPart, func) {            
            if (func) {
                if (typeof func !== 'function') throw "Handler must be a function";
                handlers.urlStartsWithHandlers[urlPart.toLowerCase()] = func; 
            } else {
                delete handlers.urlStartsWithHandlers[urlPart.toLowerCase()];
            }
        },        
        whenUrlContains: function(urlPart, func) {            
            if (func) {
                if (typeof func !== 'function') throw "Handler must be a function";
                handlers.urlContainsHandlers[urlPart.toLowerCase()] = func; 
            } else {
                delete handlers.urlContainsHandlers[urlPart.toLowerCase()];
            }
        },        
        whenAny: function(func) {            
            if (func) {
                if (typeof func !== 'function') throw "Handler must be a function";
                handlers.anyHandler = func;
            } else {
                handlers.anyHandler = null;
            }
        },
        clear: function() {
            init();
        }
    }
}

// Assertion class
var assert = function(onFail) {
    if (typeof onFail !== 'function') throw 'Assert failure handler must be a function';

    return {
        areEqual: function(expected, actual, message) {            
            if (expected !== actual) {
                message = message || "Value [" + expected + "] expected but was [" + actual + "]";
                onFail.call(null, message);
                return false;
            }
            return true;
        },
        areNotEqual: function(expected, actual, message) {
            if (expected === actual) {
                message = message || "Value [" + expected + "] was not expected";
                onFail.call(null, message);
                return false;
            }            
            return true;
        },
        arePseudoEqual: function(expected, actual, message) {
            if (expected != actual) {
                message = message || "Pseudo value [" + expected + "] expected but was [" + actual + "]";
                onFail.call(null, message);
                return false;
            }
            return true;
        },
        areNotPseudoEqual: function(expected, actual, message) {
            if (expected == actual) {
                message = message || "Pseudo value [" + expected + "] was not expected";
                onFail.call(null, message);
                return false;
            }
            return true;
        },
        isTrue: function(actual, meassage) {
            if (actual != true) {
                message = message || "True expected but was false";
                onFail.call(null, message);
                return false;
            }
            return true;
        },
        isFalse: function(actual, meassage) { 
            if (actual == true) {
                message = message || "False expected but was true";
                onFail.call(null, message);
                return false;
            }
            return true;            
        },
        isTruthy: function(actual, meassage) { 
            if (!actual) {
                message = message || "Truthy value expected but was falsey";
                onFail.call(null, message);
                return false;
            }
            return true;            
        },
        isFalsey: function(actual, meassage) { 
            if (actual) {
                message = message || "Falsey value expected but was truthy";
                onFail.call(null, message);
                return false;
            }
            return true;              
        },
        hasProperty: function(obj, prop, meassage) { 
            if (!obj[prop]) {
                message = message || "Object property [" + prop + "] expected but was not found";
                onFail.call(null, message);
                return false;                
            }
            return true;
        },
        fail: function(message) {
            message = message || "Assertion failed";
            onFail.call(null, message);
            return false;
        }
    };
}