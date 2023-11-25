type Human = {
  name: string;
  age: number;
};

function changeName(human: Human, name: string): Human {
  return { ...human, name };
}

const firstHuman: Human = { name: "Adam", age: 33 };

const newHuman = changeName(firstHuman, ":)");
