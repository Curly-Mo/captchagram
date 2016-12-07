import SpellChecker from 'spellchecker';
import natural from 'natural';
let tokenizer = new natural.WordTokenizer();
let wordnet = new natural.WordNet();
import magic from 'wordnet-magic';
let wn = magic('data/wordnet.db');

export function lookup(label, callback){
  label = label.toLowerCase();
  wn.morphy(label).then(function(morphy){
    if(morphy.length > 0){
      label = morphy[0].lemma;
      wordnet.lookup(label, function(results){
        callback(results);
      });
    }else{
      let tokens = tokenizer.tokenize(label);
      let semaphore = 0;
      let results = new Set();
      tokens.forEach(function(token){
        semaphore += 1;
        if(SpellChecker.isMisspelled(token)){
          let corrections = SpellChecker.getCorrectionsForMisspelling(token);
          if(corrections.length > 0){
            token = corrections[0].toLowerCase();
          }
        }
        wn.morphy(token).then(function(morphed){
          semaphore -= 1;
          if(morphed.length > 0){
            semaphore += 1;
            token = morphed[0].lemma;
            wordnet.lookup(token, function(synsets){
              semaphore -= 1;
              synsets.forEach(function(synset){
                results.add(synset);
              });
              if(semaphore == 0){
                callback(Array.from(results));
              }
            });
          }else{
            console.log('bad:' + token);
            if(semaphore == 0){
              callback(Array.from(results));
            }
          }
        });
      });
    }
  });
}

export function lookup_related(label, callback){
  let synsets = new Set();
  let related_synsets = new Set();
  let semaphore = 0;
  lookup(label, function(results){
    results.forEach(function(result){
      semaphore += 1;
      synsets.add(result);
      get_related(result, function(related){
        semaphore -= 1;
        related.forEach(function(related_synset){
          related_synsets.add(related_synset);
        });
        if(semaphore == 0){
          callback(Array.from(synsets), Array.from(related_synsets));
        }
      });
    }); 
    if(semaphore == 0){
      callback(Array.from(synsets), Array.from(related_synsets));
    }
  });
}

function get_related(synset, callback){
  let related_synsets = new Set();
  let semaphore = 0;
  synset.ptrs.forEach(function(pointer){
    semaphore += 1;
    wordnet.get(pointer.synsetOffset, pointer.pos, function(related){
      semaphore -= 1;
      let syn_id = related.synsetOffset.toString();
      related_synsets.add(related);
      if(pointer.pointerSymbol == '@' || pointer.pointerSymbol == '@i'){
        semaphore += 1;
        get_hyponyms_tree(related, 2, function(hyponyms){
          semaphore -= 1;
          hyponyms.forEach(function(hyponym){
            related_synsets.add(hyponym);
          });
          if(semaphore == 0){
            callback(Array.from(related_synsets));
          }
        });
      }
      if(semaphore == 0){
        callback(Array.from(related_synsets));
      }
    });
  });
  if(semaphore == 0){
    callback(Array.from(related_synsets));
  }
}

function get_hyponyms_tree(synset, depth=-1, callback){
  let hyponyms = [];
  let semaphore = 0;
  if(depth == 0){
    callback(hyponyms);
    return;
  }
  synset.ptrs.forEach(function(ptr){
    let symbol = ptr.pointerSymbol;
    if(symbol == '~' || symbol == '~i'){
      semaphore += 1;
      wordnet.get(ptr.synsetOffset, ptr.pos, function(hyponym){
        hyponyms.push(hyponym);
        get_hyponyms_tree(hyponym, depth-1, function(nested_hyponyms){
          semaphore -= 1;
          hyponyms = hyponyms.concat(nested_hyponyms);
          if(semaphore == 0){
            callback(hyponyms);
            return;
          }
        });
      });
    }
  });
  if(semaphore == 0){
    callback(hyponyms);
    return;
  }
}
